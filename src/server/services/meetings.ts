/**
 * Servicio de reuniones y extraccion de participantes (secciones 9, 10 y 11).
 */

import 'server-only';
import { evaluateParticipants } from '@/lib/eligibility/engine';
import type { RawParticipant } from '@/lib/eligibility/types';
import { buildRoleContext } from '@/lib/zoom/roleContext';
import { ZoomApiError } from '@/lib/zoom/errors';
import { getStore, getZoomProvider, listZoomAccounts } from '../context';
import type { Actor, SnapshotWithParticipants } from '../store/types';

export interface LiveMeetingCard {
  zoomAccountId: string;
  zoomAccountName: string;
  uuid: string;
  meetingId: string;
  topic: string;
  hostName: string;
  startTime: string;
  participantCount: number | null;
  /** id interno si esta reunion ya fue seleccionada alguna vez. */
  meetingRecordId: string | null;
  hasActiveSnapshot: boolean;
}

/**
 * Reuniones activas de TODAS las cuentas vinculadas (seccion 9).
 *
 * Se consulta cuenta por cuenta y se agrega el nombre de la cuenta a cada tarjeta,
 * para que el operador nunca tenga dudas de a que sala pertenece cada reunion.
 * Si una cuenta falla, el resto se muestra igual: una cuenta caida no puede dejar
 * al operador sin poder sortear en las demas.
 */
export async function listActiveMeetings(): Promise<{
  meetings: LiveMeetingCard[];
  failedAccounts: { accountName: string; code: string }[];
}> {
  const store = getStore();
  const accounts = listZoomAccounts();
  const meetings: LiveMeetingCard[] = [];
  const failedAccounts: { accountName: string; code: string }[] = [];

  await Promise.all(
    accounts.map(async (account) => {
      try {
        const provider = getZoomProvider(account.id);
        const live = await provider.listLiveMeetings();

        for (const m of live) {
          const record = await store.findMeetingByUuid(account.id, m.uuid);
          const active = record ? await store.getActiveSnapshot(record.id) : null;

          meetings.push({
            zoomAccountId: account.id,
            zoomAccountName: account.displayName,
            uuid: m.uuid,
            meetingId: String(m.id),
            topic: m.topic,
            hostName: m.host,
            startTime: m.start_time,
            participantCount: m.participants ?? null,
            meetingRecordId: record?.id ?? null,
            hasActiveSnapshot: Boolean(active),
          });
        }
      } catch (error) {
        failedAccounts.push({
          accountName: account.displayName,
          code: error instanceof ZoomApiError ? error.code : 'UNKNOWN',
        });
      }
    }),
  );

  meetings.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return { meetings, failedAccounts };
}

export interface ExtractionInput {
  zoomAccountId: string;
  zoomAccountName: string;
  meetingUuid: string;
  meetingId: string;
  topic: string;
  hostName: string | null;
  startTime: string | null;
  actor: Actor;
  /** Co-anfitriones que mantiene el administrador (mitigacion seccion 16). */
  knownCoHostEmails?: readonly string[];
}

/**
 * Extrae los participantes CONECTADOS AHORA y crea un snapshot inmutable.
 *
 * Es la misma funcion para "Extraer participantes" y para "Actualizar
 * participantes": la segunda simplemente crea un snapshot nuevo y deja el
 * anterior archivado (seccion 11). No existe forma de modificar uno existente.
 */
export async function extractParticipants(input: ExtractionInput): Promise<SnapshotWithParticipants> {
  const store = getStore();
  const provider = getZoomProvider(input.zoomAccountId);

  // Las tres consultas son independientes: se lanzan en paralelo para que una
  // sala de 1.000 personas no sume latencias en serie (seccion 42).
  const [participants, settings, accountUsers] = await Promise.all([
    provider.listLiveParticipants(input.meetingUuid),
    provider.getMeetingSettings(input.meetingUuid).catch(() => null),
    provider.listAccountUsers().catch(() => []),
  ]);

  if (participants.length === 0) {
    throw new ZoomApiError({
      code: 'NO_PARTICIPANTS',
      technicalDetail: `La reunion ${input.meetingUuid} no reporta participantes conectados.`,
    });
  }

  const raws: RawParticipant[] = participants.map((p) => ({
    externalId: p.id ?? null,
    displayName: p.user_name,
    zoomUserId: p.user_id ?? null,
    // La Dashboard API no entrega email; solo llega por la fuente de webhooks.
    email: null,
    device: p.device ?? null,
    joinTime: p.join_time ? new Date(p.join_time) : null,
  }));

  const context = buildRoleContext({
    settings,
    accountUsers,
    knownCoHostEmails: input.knownCoHostEmails,
    hostName: input.hostName,
  });

  // Los ganadores previos de la reunion se excluyen desde el snapshot, para que
  // el operador vea el motivo en la lista y no solo al momento de sortear (seccion 24).
  const existing = await store.findMeetingByUuid(input.zoomAccountId, input.meetingUuid);
  const previousWinnerNames = existing ? await store.listPreviousWinnerNames(existing.id) : [];

  const evaluated = evaluateParticipants(raws, { ...context, previousWinnerNames });

  const result = await store.createSnapshot({
    meeting: {
      zoomAccountId: input.zoomAccountId,
      zoomAccountName: input.zoomAccountName,
      zoomMeetingUuid: input.meetingUuid,
      zoomMeetingId: input.meetingId,
      topic: input.topic,
      hostName: input.hostName,
      hostEmail: settings?.host_email ?? null,
      startTime: input.startTime ? new Date(input.startTime) : null,
    },
    source: 'ZOOM_DASHBOARD',
    evaluated: evaluated.participants,
    actor: input.actor,
  });

  await store.audit({
    action: 'PARTICIPANTS_EXTRACTED',
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    meetingId: result.snapshot.meetingId,
    snapshotId: result.snapshot.id,
    drawId: null,
    detail: {
      topic: input.topic,
      sequence: result.snapshot.sequence,
      totalFound: result.snapshot.totalFound,
      totalEligible: result.snapshot.totalEligible,
      totalExcluded: result.snapshot.totalExcluded,
      byReason: evaluated.byReason,
    },
  });

  return result;
}
