/**
 * Implementacion en memoria del repositorio.
 *
 * Permite operar la aplicacion completa sin base de datos. Los datos viven en el
 * proceso del servidor y se pierden al reiniciarlo: sirve para desarrollo, demo y
 * validacion del flujo, NO para produccion.
 *
 * Respeta las mismas invariantes que respetara Postgres:
 *  - los snapshots son inmutables una vez creados
 *  - los correlativos (sequence) son por reunion y no se reciclan
 *  - un ganador "al agua" no se borra: se marca y se enlaza con su reemplazo
 */

import 'server-only';
import { randomUUID } from 'node:crypto';
import type {
  Actor,
  AuditEntry,
  CreateDrawInput,
  CreateSnapshotInput,
  DrawStore,
  DrawWithWinners,
  SnapshotWithParticipants,
  StoredDraw,
  StoredMeeting,
  StoredParticipant,
  StoredSnapshot,
  StoredWinner,
} from './types';

interface Tables {
  meetings: Map<string, StoredMeeting>;
  snapshots: Map<string, StoredSnapshot>;
  participants: Map<string, StoredParticipant>;
  draws: Map<string, StoredDraw>;
  winners: Map<string, StoredWinner>;
  audit: AuditEntry[];
}

function emptyTables(): Tables {
  return {
    meetings: new Map(),
    snapshots: new Map(),
    participants: new Map(),
    draws: new Map(),
    winners: new Map(),
    audit: [],
  };
}

/**
 * Next recarga los modulos en cada cambio durante el desarrollo. Sin este cache
 * global, cada recarga vaciaria la "base" y el operador perderia el snapshot a
 * medio sorteo.
 */
const globalForStore = globalThis as unknown as { __adipaStore?: Tables };
const db: Tables = globalForStore.__adipaStore ?? emptyTables();
globalForStore.__adipaStore = db;

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryDrawStore implements DrawStore {
  // ─────────────────────────── reuniones ───────────────────────────

  async upsertMeeting(input: Omit<StoredMeeting, 'id' | 'createdAt'>): Promise<StoredMeeting> {
    const existing = [...db.meetings.values()].find(
      (m) => m.zoomAccountId === input.zoomAccountId && m.zoomMeetingUuid === input.zoomMeetingUuid,
    );

    if (existing) {
      const updated: StoredMeeting = { ...existing, ...input };
      db.meetings.set(existing.id, updated);
      return clone(updated);
    }

    const meeting: StoredMeeting = { ...input, id: randomUUID(), createdAt: new Date() };
    db.meetings.set(meeting.id, meeting);
    return clone(meeting);
  }

  async getMeeting(meetingId: string): Promise<StoredMeeting | null> {
    const found = db.meetings.get(meetingId);
    return found ? clone(found) : null;
  }

  async findMeetingByUuid(zoomAccountId: string, uuid: string): Promise<StoredMeeting | null> {
    const found = [...db.meetings.values()].find(
      (m) => m.zoomAccountId === zoomAccountId && m.zoomMeetingUuid === uuid,
    );
    return found ? clone(found) : null;
  }

  // ─────────────────────────── snapshots ───────────────────────────

  async createSnapshot(input: CreateSnapshotInput): Promise<SnapshotWithParticipants> {
    const meeting = await this.upsertMeeting(input.meeting);

    const previous = [...db.snapshots.values()].filter((s) => s.meetingId === meeting.id);
    // Los snapshots anteriores se conservan; solo dejan de ser el activo (seccion 11).
    for (const s of previous) db.snapshots.set(s.id, { ...s, isActive: false });

    const totalEligible = input.evaluated.filter((p) => p.eligible).length;

    const snapshot: StoredSnapshot = {
      id: randomUUID(),
      meetingId: meeting.id,
      sequence: previous.length + 1,
      source: input.source,
      capturedAt: new Date(),
      totalFound: input.evaluated.length,
      totalEligible,
      totalExcluded: input.evaluated.length - totalEligible,
      sourceFileName: input.sourceFileName ?? null,
      isActive: true,
      capturedById: input.actor.userId,
    };
    db.snapshots.set(snapshot.id, snapshot);

    const participants: StoredParticipant[] = input.evaluated.map((e) => ({
      id: randomUUID(),
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
      exclusionReason: e.exclusionReason,
      evaluationTrace: e.trace,
    }));

    for (const p of participants) db.participants.set(p.id, p);

    return { snapshot: clone(snapshot), participants: clone(participants) };
  }

  private participantsOf(snapshotId: string): StoredParticipant[] {
    return [...db.participants.values()].filter((p) => p.snapshotId === snapshotId);
  }

  async getSnapshot(snapshotId: string): Promise<SnapshotWithParticipants | null> {
    const snapshot = db.snapshots.get(snapshotId);
    if (!snapshot) return null;
    return { snapshot: clone(snapshot), participants: clone(this.participantsOf(snapshotId)) };
  }

  async getActiveSnapshot(meetingId: string): Promise<SnapshotWithParticipants | null> {
    const snapshot = [...db.snapshots.values()].find((s) => s.meetingId === meetingId && s.isActive);
    if (!snapshot) return null;
    return { snapshot: clone(snapshot), participants: clone(this.participantsOf(snapshot.id)) };
  }

  async listSnapshots(meetingId: string): Promise<StoredSnapshot[]> {
    return clone(
      [...db.snapshots.values()]
        .filter((s) => s.meetingId === meetingId)
        .sort((a, b) => b.sequence - a.sequence),
    );
  }

  async setManualOverride(
    participantId: string,
    override: boolean | null,
    actor: Actor,
  ): Promise<StoredParticipant> {
    const participant = db.participants.get(participantId);
    if (!participant) throw new Error(`Participante ${participantId} no existe.`);

    // Host y co-host no se pueden incluir por decision manual (seccion 16).
    const roleLocked = participant.detectedRole === 'HOST' || participant.detectedRole === 'CO_HOST';
    if (roleLocked) {
      throw new Error('ROLE_LOCKED');
    }

    const previousState = participant.eligible;
    const eligible = override ?? participant.autoEligible;

    const updated: StoredParticipant = {
      ...participant,
      manualOverride: override,
      eligible,
      exclusionReason: eligible ? null : override === false ? 'MANUAL' : participant.autoExclusionReason,
    };
    db.participants.set(participantId, updated);

    const snapshot = db.snapshots.get(participant.snapshotId);
    if (snapshot) this.recountSnapshot(snapshot.id);

    await this.audit({
      action: eligible ? 'PARTICIPANT_INCLUDED' : 'PARTICIPANT_EXCLUDED',
      actorId: actor.userId,
      actorEmail: actor.email,
      meetingId: snapshot?.meetingId ?? null,
      snapshotId: participant.snapshotId,
      drawId: null,
      detail: {
        participantId,
        displayName: participant.displayName,
        previousState,
        newState: eligible,
        autoReason: participant.autoExclusionReason,
      },
    });

    return clone(updated);
  }

  /** Recalcula los totales del snapshot tras una intervencion manual. */
  private recountSnapshot(snapshotId: string): void {
    const snapshot = db.snapshots.get(snapshotId);
    if (!snapshot) return;

    const participants = this.participantsOf(snapshotId);
    const totalEligible = participants.filter((p) => p.eligible).length;

    db.snapshots.set(snapshotId, {
      ...snapshot,
      totalEligible,
      totalExcluded: participants.length - totalEligible,
    });
  }

  // ─────────────────────────── sorteos ───────────────────────────

  async createDraw(input: CreateDrawInput): Promise<StoredDraw> {
    const previous = [...db.draws.values()].filter((d) => d.meetingId === input.meetingId);

    const draw: StoredDraw = {
      id: randomUUID(),
      meetingId: input.meetingId,
      snapshotId: input.snapshotId,
      sequence: previous.length + 1,
      requestedWinners: input.requestedWinners,
      actualWinners: 0,
      countdownSeconds: input.countdownSeconds,
      poolSize: input.poolSize,
      poolHash: input.poolHash,
      status: 'RUNNING',
      startedAt: new Date(),
      completedAt: null,
      operatorId: input.actor.userId,
      operatorName: input.actor.name,
    };

    db.draws.set(draw.id, draw);
    return clone(draw);
  }

  async completeDraw(
    drawId: string,
    winners: { participantId: string; winnerName: string }[],
  ): Promise<DrawWithWinners> {
    const draw = db.draws.get(drawId);
    if (!draw) throw new Error(`Sorteo ${drawId} no existe.`);

    const created: StoredWinner[] = winners.map((w, index) => ({
      id: randomUUID(),
      drawId,
      participantId: w.participantId,
      winnerName: w.winnerName,
      position: index + 1,
      status: 'PENDING',
      replacedByWinnerId: null,
      alAguaReason: null,
      alAguaAt: null,
      validatedAt: null,
      validatedById: null,
      validatedByName: null,
      certificateFileName: null,
      createdAt: new Date(),
    }));

    for (const w of created) db.winners.set(w.id, w);

    const completed: StoredDraw = {
      ...draw,
      status: 'COMPLETED',
      actualWinners: created.length,
      completedAt: new Date(),
    };
    db.draws.set(drawId, completed);

    return { draw: clone(completed), winners: clone(created) };
  }

  private winnersOf(drawId: string): StoredWinner[] {
    return [...db.winners.values()]
      .filter((w) => w.drawId === drawId)
      .sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getDraw(drawId: string): Promise<DrawWithWinners | null> {
    const draw = db.draws.get(drawId);
    if (!draw) return null;
    return { draw: clone(draw), winners: clone(this.winnersOf(drawId)) };
  }

  async listDraws(meetingId: string): Promise<DrawWithWinners[]> {
    return [...db.draws.values()]
      .filter((d) => d.meetingId === meetingId)
      .sort((a, b) => a.sequence - b.sequence)
      .map((d) => ({ draw: clone(d), winners: clone(this.winnersOf(d.id)) }));
  }

  /**
   * Ganadores previos de la reunion. Se excluyen los enviados "al agua": esa
   * persona no gano, fue descalificada, y no corresponde bloquearla como ganadora.
   */
  async listPreviousWinnerNames(meetingId: string): Promise<string[]> {
    const drawIds = new Set(
      [...db.draws.values()].filter((d) => d.meetingId === meetingId).map((d) => d.id),
    );

    return [...db.winners.values()]
      .filter((w) => drawIds.has(w.drawId) && w.status !== 'AL_AGUA')
      .map((w) => w.winnerName);
  }

  async listBlockedParticipantIds(drawId: string): Promise<string[]> {
    // Dentro de un sorteo quedan bloqueados tanto los ganadores vigentes como los
    // ya enviados al agua: ninguno puede volver a salir (seccion 12).
    return this.winnersOf(drawId).map((w) => w.participantId);
  }

  async getWinner(winnerId: string): Promise<StoredWinner | null> {
    const found = db.winners.get(winnerId);
    return found ? clone(found) : null;
  }

  async markAlAgua(winnerId: string, reason: string | null, actor: Actor): Promise<StoredWinner> {
    const winner = db.winners.get(winnerId);
    if (!winner) throw new Error(`Ganador ${winnerId} no existe.`);
    if (winner.status === 'VALIDATED') throw new Error('ALREADY_VALIDATED');

    const updated: StoredWinner = {
      ...winner,
      status: 'AL_AGUA',
      alAguaReason: reason,
      alAguaAt: new Date(),
    };
    db.winners.set(winnerId, updated);

    const draw = db.draws.get(winner.drawId);
    await this.audit({
      action: 'WINNER_AL_AGUA',
      actorId: actor.userId,
      actorEmail: actor.email,
      meetingId: draw?.meetingId ?? null,
      snapshotId: draw?.snapshotId ?? null,
      drawId: winner.drawId,
      detail: { winnerId, winnerName: winner.winnerName, reason },
    });

    return clone(updated);
  }

  async addReplacementWinner(
    drawId: string,
    replacedWinnerId: string,
    participantId: string,
    winnerName: string,
  ): Promise<StoredWinner> {
    const replaced = db.winners.get(replacedWinnerId);
    if (!replaced) throw new Error(`Ganador ${replacedWinnerId} no existe.`);

    const replacement: StoredWinner = {
      id: randomUUID(),
      drawId,
      participantId,
      winnerName,
      // Ocupa la misma posicion que el descalificado: el sorteo sigue teniendo
      // la cantidad de ganadores que se configuro.
      position: replaced.position,
      status: 'PENDING',
      replacedByWinnerId: null,
      alAguaReason: null,
      alAguaAt: null,
      validatedAt: null,
      validatedById: null,
      validatedByName: null,
      certificateFileName: null,
      createdAt: new Date(),
    };

    db.winners.set(replacement.id, replacement);
    db.winners.set(replacedWinnerId, { ...replaced, replacedByWinnerId: replacement.id });

    return clone(replacement);
  }

  async validateWinner(winnerId: string, actor: Actor): Promise<StoredWinner> {
    const winner = db.winners.get(winnerId);
    if (!winner) throw new Error(`Ganador ${winnerId} no existe.`);
    if (winner.status === 'AL_AGUA') throw new Error('WINNER_DISQUALIFIED');

    const updated: StoredWinner = {
      ...winner,
      status: 'VALIDATED',
      validatedAt: new Date(),
      validatedById: actor.userId,
      validatedByName: actor.name,
    };
    db.winners.set(winnerId, updated);

    const draw = db.draws.get(winner.drawId);
    await this.audit({
      action: 'WINNER_VALIDATED',
      actorId: actor.userId,
      actorEmail: actor.email,
      meetingId: draw?.meetingId ?? null,
      snapshotId: draw?.snapshotId ?? null,
      drawId: winner.drawId,
      detail: { winnerId, winnerName: winner.winnerName },
    });

    return clone(updated);
  }

  async attachCertificate(winnerId: string, fileName: string): Promise<StoredWinner> {
    const winner = db.winners.get(winnerId);
    if (!winner) throw new Error(`Ganador ${winnerId} no existe.`);

    const updated = { ...winner, certificateFileName: fileName };
    db.winners.set(winnerId, updated);
    return clone(updated);
  }

  // ─────────────────────────── auditoria ───────────────────────────

  async audit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    db.audit.push({ ...entry, id: randomUUID(), createdAt: new Date() });
  }

  async listAudit(filter: { meetingId?: string; limit?: number } = {}): Promise<AuditEntry[]> {
    const { meetingId, limit = 200 } = filter;
    return clone(
      db.audit
        .filter((e) => !meetingId || e.meetingId === meetingId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    );
  }
}

/** Solo para tests: vacia el almacen. */
export function resetMemoryStore(): void {
  const fresh = emptyTables();
  db.meetings = fresh.meetings;
  db.snapshots = fresh.snapshots;
  db.participants = fresh.participants;
  db.draws = fresh.draws;
  db.winners = fresh.winners;
  db.audit = fresh.audit;
}
