/**
 * Implementacion del repositorio contra PostgreSQL, via Prisma.
 *
 * Es la gemela de `MemoryDrawStore`: mismo contrato, mismas invariantes. La
 * diferencia es que aqui los datos sobreviven al reinicio del proceso, que es lo
 * que hace falta en un despliegue serverless donde cada peticion puede caer en
 * una instancia distinta.
 *
 * Dos desajustes entre el contrato y el esquema, resueltos aqui:
 *
 *  1. `StoredMeeting.zoomAccountId` es el id EXTERNO de la cuenta Zoom, mientras
 *     que `Meeting.zoomAccountId` es una clave foranea a la tabla ZoomAccount.
 *     Se traduce en `ensureZoomAccount()`, que crea la fila si no existe: en modo
 *     simulador no hay ninguna cuenta vinculada y sin esto no se podria guardar
 *     ni una reunion.
 *
 *  2. Los ids de actor son claves foraneas a User. Se resuelven por email con
 *     `ensureUser()` en vez de confiar en el id que venga en la sesion: un id
 *     que no exista reventaria la operacion completa, y perder un sorteo en vivo
 *     por eso seria mucho peor que una consulta de mas.
 */

import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import type {
  Actor,
  AuditEntry,
  CreateDrawInput,
  CreateSnapshotInput,
  DrawStore,
  DrawWithWinners,
  ParticipantSource,
  SnapshotWithParticipants,
  StoredDraw,
  StoredMeeting,
  StoredParticipant,
  StoredSnapshot,
  StoredWinner,
} from './types';
import type { DetectedRole, ExclusionReason } from '@/lib/eligibility/types';

/** Dimensiones con las que se genera el comprobante (src/lib/certificate/render.ts). */
const CERTIFICATE_WIDTH = 1600;
const CERTIFICATE_HEIGHT = 900;

type Tx = Prisma.TransactionClient | PrismaClient;

// ─────────────────────────── traduccion de filas ───────────────────────────

type MeetingRow = Prisma.MeetingGetPayload<{ include: { zoomAccount: true } }>;
type ParticipantRow = Prisma.SnapshotParticipantGetPayload<object>;
type SnapshotRow = Prisma.SnapshotGetPayload<object>;
type DrawRow = Prisma.DrawGetPayload<{ include: { operator: true } }>;
type WinnerRow = Prisma.DrawWinnerGetPayload<{
  include: { validatedBy: true; certificate: true };
}>;

const toMeeting = (row: MeetingRow): StoredMeeting => ({
  id: row.id,
  zoomAccountId: row.zoomAccount.zoomAccountId,
  zoomAccountName: row.zoomAccount.displayName,
  zoomMeetingUuid: row.zoomMeetingUuid,
  zoomMeetingId: row.zoomMeetingId,
  topic: row.topic,
  hostName: row.hostName,
  hostEmail: row.hostEmail,
  startTime: row.startTime,
  createdAt: row.createdAt,
});

const toParticipant = (row: ParticipantRow): StoredParticipant => ({
  id: row.id,
  snapshotId: row.snapshotId,
  displayName: row.displayName,
  normalizedName: row.normalizedName,
  personName: row.personName,
  zoomParticipantId: row.zoomParticipantId,
  zoomUserId: row.zoomUserId,
  email: row.email,
  device: row.device,
  joinTime: row.joinTime,
  detectedRole: row.detectedRole as DetectedRole,
  autoEligible: row.autoEligible,
  autoExclusionReason: row.autoExclusionReason as ExclusionReason | null,
  manualOverride: row.manualOverride,
  eligible: row.eligible,
  // El motivo final no se guarda en columna propia: se deriva igual que en memoria.
  exclusionReason: row.eligible
    ? null
    : row.manualOverride === false
      ? 'MANUAL'
      : (row.autoExclusionReason as ExclusionReason | null),
  evaluationTrace: Array.isArray(row.evaluationTrace) ? (row.evaluationTrace as string[]) : [],
});

const toSnapshot = (row: SnapshotRow): StoredSnapshot => ({
  id: row.id,
  meetingId: row.meetingId,
  sequence: row.sequence,
  source: row.source as ParticipantSource,
  capturedAt: row.capturedAt,
  totalFound: row.totalFound,
  totalEligible: row.totalEligible,
  totalExcluded: row.totalExcluded,
  sourceFileName: row.sourceFileName,
  isActive: row.isActive,
  capturedById: row.capturedById,
});

const toDraw = (row: DrawRow): StoredDraw => ({
  id: row.id,
  meetingId: row.meetingId,
  snapshotId: row.snapshotId,
  sequence: row.sequence,
  requestedWinners: row.requestedWinners,
  actualWinners: row.actualWinners,
  countdownSeconds: row.countdownSeconds,
  poolSize: row.poolSize,
  poolHash: row.poolHash,
  status: row.status,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  operatorId: row.operatorId,
  operatorName: row.operator?.name ?? null,
});

const toWinner = (row: WinnerRow): StoredWinner => ({
  id: row.id,
  drawId: row.drawId,
  participantId: row.participantId,
  winnerName: row.winnerName,
  position: row.position,
  status: row.status,
  replacedByWinnerId: row.replacedByWinnerId,
  alAguaReason: row.alAguaReason,
  alAguaAt: row.alAguaAt,
  validatedAt: row.validatedAt,
  validatedById: row.validatedById,
  validatedByName: row.validatedBy?.name ?? null,
  certificateFileName: row.certificate?.fileName ?? null,
  createdAt: row.createdAt,
});

const WINNER_INCLUDE = { validatedBy: true, certificate: true } as const;

/** Orden estable de los ganadores dentro de un sorteo. */
const WINNER_ORDER: Prisma.DrawWinnerOrderByWithRelationInput[] = [
  { position: 'asc' },
  { createdAt: 'asc' },
];

// ─────────────────────────── el almacen ───────────────────────────

export class PrismaDrawStore implements DrawStore {
  /**
   * Crea la cuenta Zoom si no existe y devuelve su id interno.
   *
   * En modo simulador no hay ninguna cuenta vinculada por un administrador, asi
   * que la primera reunion que se guarda la crea sobre la marcha.
   */
  private async ensureZoomAccount(
    tx: Tx,
    zoomAccountId: string,
    displayName: string,
  ): Promise<string> {
    const account = await tx.zoomAccount.upsert({
      where: { zoomAccountId },
      update: { displayName },
      create: { zoomAccountId, displayName },
      select: { id: true },
    });
    return account.id;
  }

  /** Garantiza que el actor exista como User, para que las claves foraneas resuelvan. */
  private async ensureUser(tx: Tx, actor: Actor): Promise<string> {
    const email = actor.email.trim().toLowerCase();
    const user = await tx.user.upsert({
      where: { email },
      update: actor.name ? { name: actor.name } : {},
      create: { email, name: actor.name },
      select: { id: true },
    });
    return user.id;
  }

  // ─────────────────────────── reuniones ───────────────────────────

  async upsertMeeting(input: Omit<StoredMeeting, 'id' | 'createdAt'>): Promise<StoredMeeting> {
    const accountId = await this.ensureZoomAccount(
      prisma,
      input.zoomAccountId,
      input.zoomAccountName,
    );

    const data = {
      zoomMeetingId: input.zoomMeetingId,
      topic: input.topic,
      hostName: input.hostName,
      hostEmail: input.hostEmail,
      startTime: input.startTime,
    };

    const row = await prisma.meeting.upsert({
      where: {
        zoomAccountId_zoomMeetingUuid: {
          zoomAccountId: accountId,
          zoomMeetingUuid: input.zoomMeetingUuid,
        },
      },
      update: data,
      create: { ...data, zoomAccountId: accountId, zoomMeetingUuid: input.zoomMeetingUuid },
      include: { zoomAccount: true },
    });

    return toMeeting(row);
  }

  async getMeeting(meetingId: string): Promise<StoredMeeting | null> {
    const row = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { zoomAccount: true },
    });
    return row ? toMeeting(row) : null;
  }

  async findMeetingByUuid(zoomAccountId: string, uuid: string): Promise<StoredMeeting | null> {
    const row = await prisma.meeting.findFirst({
      where: { zoomMeetingUuid: uuid, zoomAccount: { zoomAccountId } },
      include: { zoomAccount: true },
    });
    return row ? toMeeting(row) : null;
  }

  /**
   * Deja la reunion como si nunca se hubiera seleccionado.
   *
   * El orden importa y no se puede delegar del todo al ON DELETE CASCADE de la
   * reunion: `Draw.snapshotId` es RESTRICT, asi que borrar la reunion podria
   * intentar eliminar el snapshot mientras un sorteo todavia lo referencia. Se
   * borran primero los sorteos (que arrastran ganadores y comprobantes), luego
   * los snapshots (que arrastran participantes y decisiones manuales) y al final
   * la reunion.
   *
   * Todo en una transaccion: un borrado a medias dejaria la reunion en un estado
   * peor que el que se queria limpiar.
   *
   * La auditoria queda intacta: sus columnas de reunion, snapshot y sorteo son
   * texto suelto, no claves foraneas, precisamente para sobrevivir a esto.
   */
  async resetMeeting(meetingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.draw.deleteMany({ where: { meetingId } });
      await tx.snapshot.deleteMany({ where: { meetingId } });
      await tx.liveRosterEntry.deleteMany({ where: { meetingId } });
      await tx.meeting.deleteMany({ where: { id: meetingId } });
    });
  }

  // ─────────────────────────── snapshots ───────────────────────────

  async createSnapshot(input: CreateSnapshotInput): Promise<SnapshotWithParticipants> {
    const meeting = await this.upsertMeeting(input.meeting);

    return prisma.$transaction(async (tx) => {
      const capturedById = await this.ensureUser(tx, input.actor);

      // Los snapshots anteriores se conservan; solo dejan de ser el activo (seccion 11).
      const previous = await tx.snapshot.count({ where: { meetingId: meeting.id } });
      await tx.snapshot.updateMany({
        where: { meetingId: meeting.id, isActive: true },
        data: { isActive: false },
      });

      const totalEligible = input.evaluated.filter((p) => p.eligible).length;

      const snapshot = await tx.snapshot.create({
        data: {
          meetingId: meeting.id,
          sequence: previous + 1,
          source: input.source,
          totalFound: input.evaluated.length,
          totalEligible,
          totalExcluded: input.evaluated.length - totalEligible,
          sourceFileName: input.sourceFileName ?? null,
          isActive: true,
          capturedById,
        },
      });

      await tx.snapshotParticipant.createMany({
        data: input.evaluated.map((e) => ({
          snapshotId: snapshot.id,
          displayName: e.displayName,
          normalizedName: e.normalizedName,
          personName: e.personName,
          zoomParticipantId: e.raw.externalId ?? null,
          zoomUserId: e.raw.zoomUserId ?? null,
          email: e.raw.email ?? null,
          device: e.raw.device ?? null,
          joinTime: e.raw.joinTime ?? null,
          detectedRole: e.detectedRole,
          autoEligible: e.autoEligible,
          autoExclusionReason: e.autoExclusionReason,
          manualOverride: e.manualOverride,
          eligible: e.eligible,
          evaluationTrace: e.trace,
        })),
      });

      const participants = await tx.snapshotParticipant.findMany({
        where: { snapshotId: snapshot.id },
        orderBy: { createdAt: 'asc' },
      });

      return { snapshot: toSnapshot(snapshot), participants: participants.map(toParticipant) };
    });
  }

  private async loadSnapshot(
    where: Prisma.SnapshotWhereInput,
  ): Promise<SnapshotWithParticipants | null> {
    const snapshot = await prisma.snapshot.findFirst({ where });
    if (!snapshot) return null;

    const participants = await prisma.snapshotParticipant.findMany({
      where: { snapshotId: snapshot.id },
      orderBy: { createdAt: 'asc' },
    });

    return { snapshot: toSnapshot(snapshot), participants: participants.map(toParticipant) };
  }

  async getSnapshot(snapshotId: string): Promise<SnapshotWithParticipants | null> {
    return this.loadSnapshot({ id: snapshotId });
  }

  async getActiveSnapshot(meetingId: string): Promise<SnapshotWithParticipants | null> {
    return this.loadSnapshot({ meetingId, isActive: true });
  }

  async listSnapshots(meetingId: string): Promise<StoredSnapshot[]> {
    const rows = await prisma.snapshot.findMany({
      where: { meetingId },
      orderBy: { sequence: 'desc' },
    });
    return rows.map(toSnapshot);
  }

  async setManualOverride(
    participantId: string,
    override: boolean | null,
    actor: Actor,
  ): Promise<StoredParticipant> {
    return prisma.$transaction(async (tx) => {
      const participant = await tx.snapshotParticipant.findUnique({
        where: { id: participantId },
        include: { snapshot: true },
      });
      if (!participant) throw new Error(`Participante ${participantId} no existe.`);

      // Host y co-host no se pueden incluir por decision manual (seccion 16).
      if (participant.detectedRole === 'HOST' || participant.detectedRole === 'CO_HOST') {
        throw new Error('ROLE_LOCKED');
      }

      const previousState = participant.eligible;
      const eligible = override ?? participant.autoEligible;

      const updated = await tx.snapshotParticipant.update({
        where: { id: participantId },
        data: { manualOverride: override, eligible },
      });

      // Se recalculan los totales del snapshot tras la intervencion manual.
      const totalEligible = await tx.snapshotParticipant.count({
        where: { snapshotId: participant.snapshotId, eligible: true },
      });
      const totalFound = await tx.snapshotParticipant.count({
        where: { snapshotId: participant.snapshotId },
      });

      await tx.snapshot.update({
        where: { id: participant.snapshotId },
        data: { totalEligible, totalExcluded: totalFound - totalEligible },
      });

      const actorId = await this.ensureUser(tx, actor);

      await tx.manualOverride.create({
        data: {
          snapshotId: participant.snapshotId,
          participantId,
          previousState,
          newState: eligible,
          autoReason: participant.autoExclusionReason,
          actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: eligible ? 'PARTICIPANT_INCLUDED' : 'PARTICIPANT_EXCLUDED',
          actorId,
          actorEmail: actor.email,
          meetingId: participant.snapshot.meetingId,
          snapshotId: participant.snapshotId,
          detail: {
            participantId,
            displayName: participant.displayName,
            previousState,
            newState: eligible,
            autoReason: participant.autoExclusionReason,
          },
        },
      });

      return toParticipant(updated);
    });
  }

  // ─────────────────────────── sorteos ───────────────────────────

  async createDraw(input: CreateDrawInput): Promise<StoredDraw> {
    return prisma.$transaction(async (tx) => {
      const operatorId = await this.ensureUser(tx, input.actor);
      const previous = await tx.draw.count({ where: { meetingId: input.meetingId } });

      const row = await tx.draw.create({
        data: {
          meetingId: input.meetingId,
          snapshotId: input.snapshotId,
          sequence: previous + 1,
          requestedWinners: input.requestedWinners,
          actualWinners: 0,
          countdownSeconds: input.countdownSeconds,
          poolSize: input.poolSize,
          poolHash: input.poolHash,
          status: 'RUNNING',
          operatorId,
        },
        include: { operator: true },
      });

      return toDraw(row);
    });
  }

  async completeDraw(
    drawId: string,
    winners: { participantId: string; winnerName: string }[],
  ): Promise<DrawWithWinners> {
    await prisma.$transaction(async (tx) => {
      await tx.drawWinner.createMany({
        data: winners.map((w, index) => ({
          drawId,
          participantId: w.participantId,
          winnerName: w.winnerName,
          position: index + 1,
          status: 'PENDING' as const,
        })),
      });

      await tx.draw.update({
        where: { id: drawId },
        data: { status: 'COMPLETED', actualWinners: winners.length, completedAt: new Date() },
      });
    });

    const result = await this.getDraw(drawId);
    if (!result) throw new Error(`Sorteo ${drawId} no existe.`);
    return result;
  }

  async getDraw(drawId: string): Promise<DrawWithWinners | null> {
    const draw = await prisma.draw.findUnique({
      where: { id: drawId },
      include: { operator: true },
    });
    if (!draw) return null;

    const winners = await prisma.drawWinner.findMany({
      where: { drawId },
      include: WINNER_INCLUDE,
      orderBy: WINNER_ORDER,
    });

    return { draw: toDraw(draw), winners: winners.map(toWinner) };
  }

  async listDraws(meetingId: string): Promise<DrawWithWinners[]> {
    const draws = await prisma.draw.findMany({
      where: { meetingId },
      include: { operator: true, winners: { include: WINNER_INCLUDE, orderBy: WINNER_ORDER } },
      orderBy: { sequence: 'asc' },
    });

    return draws.map((draw) => ({
      draw: toDraw(draw),
      winners: draw.winners.map(toWinner),
    }));
  }

  /**
   * Ganadores previos de la reunion. Se excluyen los enviados "al agua": esa
   * persona no gano, fue descalificada, y no corresponde bloquearla.
   */
  async listPreviousWinnerNames(meetingId: string): Promise<string[]> {
    const rows = await prisma.drawWinner.findMany({
      where: { draw: { meetingId }, status: { not: 'AL_AGUA' } },
      select: { winnerName: true },
    });
    return rows.map((r) => r.winnerName);
  }

  async listBlockedParticipantIds(drawId: string): Promise<string[]> {
    // Dentro de un sorteo quedan bloqueados tanto los ganadores vigentes como los
    // ya enviados al agua: ninguno puede volver a salir (seccion 12).
    const rows = await prisma.drawWinner.findMany({
      where: { drawId },
      select: { participantId: true },
    });
    return rows.map((r) => r.participantId);
  }

  async getWinner(winnerId: string): Promise<StoredWinner | null> {
    const row = await prisma.drawWinner.findUnique({
      where: { id: winnerId },
      include: WINNER_INCLUDE,
    });
    return row ? toWinner(row) : null;
  }

  async markAlAgua(winnerId: string, reason: string | null, actor: Actor): Promise<StoredWinner> {
    return prisma.$transaction(async (tx) => {
      const winner = await tx.drawWinner.findUnique({
        where: { id: winnerId },
        include: { draw: true },
      });
      if (!winner) throw new Error(`Ganador ${winnerId} no existe.`);
      if (winner.status === 'VALIDATED') throw new Error('ALREADY_VALIDATED');

      const updated = await tx.drawWinner.update({
        where: { id: winnerId },
        data: { status: 'AL_AGUA', alAguaReason: reason, alAguaAt: new Date() },
        include: WINNER_INCLUDE,
      });

      const actorId = await this.ensureUser(tx, actor);

      await tx.auditLog.create({
        data: {
          action: 'WINNER_AL_AGUA',
          actorId,
          actorEmail: actor.email,
          meetingId: winner.draw.meetingId,
          snapshotId: winner.draw.snapshotId,
          drawId: winner.drawId,
          detail: { winnerId, winnerName: winner.winnerName, reason },
        },
      });

      return toWinner(updated);
    });
  }

  async addReplacementWinner(
    drawId: string,
    replacedWinnerId: string,
    participantId: string,
    winnerName: string,
  ): Promise<StoredWinner> {
    return prisma.$transaction(async (tx) => {
      const replaced = await tx.drawWinner.findUnique({ where: { id: replacedWinnerId } });
      if (!replaced) throw new Error(`Ganador ${replacedWinnerId} no existe.`);

      const replacement = await tx.drawWinner.create({
        data: {
          drawId,
          participantId,
          winnerName,
          // Ocupa la misma posicion que el descalificado: el sorteo conserva la
          // cantidad de ganadores que se configuro.
          position: replaced.position,
          status: 'PENDING',
        },
        include: WINNER_INCLUDE,
      });

      await tx.drawWinner.update({
        where: { id: replacedWinnerId },
        data: { replacedByWinnerId: replacement.id },
      });

      return toWinner(replacement);
    });
  }

  async validateWinner(winnerId: string, actor: Actor): Promise<StoredWinner> {
    return prisma.$transaction(async (tx) => {
      const winner = await tx.drawWinner.findUnique({
        where: { id: winnerId },
        include: { draw: true },
      });
      if (!winner) throw new Error(`Ganador ${winnerId} no existe.`);
      if (winner.status === 'AL_AGUA') throw new Error('WINNER_DISQUALIFIED');

      const validatedById = await this.ensureUser(tx, actor);

      const updated = await tx.drawWinner.update({
        where: { id: winnerId },
        data: { status: 'VALIDATED', validatedAt: new Date(), validatedById },
        include: WINNER_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          action: 'WINNER_VALIDATED',
          actorId: validatedById,
          actorEmail: actor.email,
          meetingId: winner.draw.meetingId,
          snapshotId: winner.draw.snapshotId,
          drawId: winner.drawId,
          detail: { winnerId, winnerName: winner.winnerName },
        },
      });

      return toWinner(updated);
    });
  }

  async attachCertificate(winnerId: string, fileName: string): Promise<StoredWinner> {
    // El comprobante se sirve al vuelo, no se guarda en disco: `filePath` registra
    // el nombre con el que se entrego, para poder rastrearlo en la auditoria.
    await prisma.certificate.upsert({
      where: { winnerId },
      update: { fileName, filePath: fileName },
      create: {
        winnerId,
        fileName,
        filePath: fileName,
        widthPx: CERTIFICATE_WIDTH,
        heightPx: CERTIFICATE_HEIGHT,
      },
    });

    const winner = await this.getWinner(winnerId);
    if (!winner) throw new Error(`Ganador ${winnerId} no existe.`);
    return winner;
  }

  // ─────────────────────────── auditoria ───────────────────────────

  async audit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    // El actor puede no existir como User (por ejemplo, eventos de sistema): la
    // columna admite null y el email queda congelado igualmente.
    const actorId = entry.actorId
      ? ((await prisma.user.findUnique({ where: { id: entry.actorId }, select: { id: true } }))
          ?.id ?? null)
      : null;

    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId,
        actorEmail: entry.actorEmail,
        meetingId: entry.meetingId,
        snapshotId: entry.snapshotId,
        drawId: entry.drawId,
        detail: (entry.detail ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listAudit(filter: { meetingId?: string; limit?: number } = {}): Promise<AuditEntry[]> {
    const rows = await prisma.auditLog.findMany({
      where: filter.meetingId ? { meetingId: filter.meetingId } : {},
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 200,
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      meetingId: row.meetingId,
      snapshotId: row.snapshotId,
      drawId: row.drawId,
      detail: (row.detail as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
    }));
  }
}
