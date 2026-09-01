'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/server/authz';
import { getStore } from '@/server/context';
import { extractParticipants } from '@/server/services/meetings';
import { ZoomApiError, type ZoomErrorCode } from '@/lib/zoom/errors';

export interface ActionResult {
  ok: boolean;
  /** Codigo de error de Zoom, ya traducible por i18n (seccion 41). */
  zoomError?: ZoomErrorCode;
  /** Detalle tecnico. Solo se muestra en el panel de diagnostico. */
  technicalDetail?: string;
  message?: string;
}

/**
 * Selecciona una reunion (seccion 9).
 *
 * Registra la reunion y deja al operador en su consola. Si ya existe, reutiliza el
 * registro: seleccionar dos veces la misma reunion no duplica nada ni pierde el
 * snapshot en curso.
 */
export async function selectMeeting(formData: FormData): Promise<void> {
  const ctx = await requirePermission('meetings.select');
  const store = getStore();

  const zoomAccountId = String(formData.get('zoomAccountId'));
  const zoomMeetingUuid = String(formData.get('uuid'));

  const meeting = await store.upsertMeeting({
    zoomAccountId,
    zoomAccountName: String(formData.get('zoomAccountName')),
    zoomMeetingUuid,
    zoomMeetingId: String(formData.get('meetingId')),
    topic: String(formData.get('topic')),
    hostName: (formData.get('hostName') as string) || null,
    hostEmail: null,
    startTime: formData.get('startTime') ? new Date(String(formData.get('startTime'))) : null,
  });

  await store.audit({
    action: 'MEETING_SELECTED',
    actorId: ctx.userId,
    actorEmail: ctx.email,
    meetingId: meeting.id,
    snapshotId: null,
    drawId: null,
    detail: { topic: meeting.topic, zoomAccountName: meeting.zoomAccountName },
  });

  redirect(`/monitor/${meeting.id}`);
}

/**
 * Extrae o actualiza participantes (secciones 10 y 11).
 *
 * Es la misma accion para ambos botones: "Actualizar" simplemente crea otro
 * snapshot. Los errores de Zoom se devuelven como codigo, nunca como texto tecnico,
 * para que la UI los traduzca segun la seccion 41.
 */
export async function extractParticipantsAction(meetingId: string): Promise<ActionResult> {
  const ctx = await requirePermission('participants.extract');
  const store = getStore();

  const meeting = await store.getMeeting(meetingId);
  if (!meeting) return { ok: false, message: 'MEETING_NOT_FOUND' };

  try {
    await extractParticipants({
      zoomAccountId: meeting.zoomAccountId,
      zoomAccountName: meeting.zoomAccountName,
      meetingUuid: meeting.zoomMeetingUuid,
      meetingId: meeting.zoomMeetingId,
      topic: meeting.topic,
      hostName: meeting.hostName,
      startTime: meeting.startTime?.toISOString() ?? null,
      actor: { userId: ctx.userId, email: ctx.email, name: ctx.name },
    });

    revalidatePath(`/monitor/${meetingId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ZoomApiError) {
      await store.audit({
        action: 'ZOOM_ERROR',
        actorId: ctx.userId,
        actorEmail: ctx.email,
        meetingId,
        snapshotId: null,
        drawId: null,
        detail: { code: error.code, detail: error.technicalDetail },
      });

      return { ok: false, zoomError: error.code, technicalDetail: error.technicalDetail };
    }

    throw error;
  }
}

/** Incluir o excluir manualmente a un participante (seccion 19). */
export async function setParticipantOverride(
  meetingId: string,
  participantId: string,
  override: boolean | null,
): Promise<ActionResult> {
  const ctx = await requirePermission('participants.override');

  try {
    await getStore().setManualOverride(participantId, override, {
      userId: ctx.userId,
      email: ctx.email,
      name: ctx.name,
    });

    revalidatePath(`/monitor/${meetingId}`);
    return { ok: true };
  } catch (error) {
    // Host y co-host no se pueden incluir a mano (seccion 16).
    if (error instanceof Error && error.message === 'ROLE_LOCKED') {
      return { ok: false, message: 'ROLE_LOCKED' };
    }
    throw error;
  }
}
