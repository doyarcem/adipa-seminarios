/**
 * Servicio de sorteos (secciones 12, 23, 24, 25, 33 y 55).
 *
 * Aqui vive la integridad del sorteo: congelar el universo, ejecutar la seleccion
 * con aleatoriedad criptografica, registrar todo y no permitir que un resultado
 * se altere despues.
 */

import 'server-only';
import { hashPool, normalizeCountdown, normalizeWinnerCount, redrawOne, runDraw, type PoolEntry } from '@/lib/draw/engine';
import { getStore } from '../context';
import type { Actor, DrawWithWinners, StoredParticipant, StoredWinner } from '../store/types';

export class DrawError extends Error {
  constructor(readonly code: 'NO_SNAPSHOT' | 'EMPTY_POOL' | 'NO_REPLACEMENT' | 'ALREADY_VALIDATED' | 'DISQUALIFIED') {
    super(code);
    this.name = 'DrawError';
  }
}

/**
 * Arma el universo elegible del snapshot activo, descontando a quienes ya ganaron
 * en sorteos anteriores de la misma reunion (seccion 24).
 */
async function buildPool(meetingId: string): Promise<{ snapshotId: string; pool: PoolEntry[] }> {
  const store = getStore();

  const active = await store.getActiveSnapshot(meetingId);
  if (!active) throw new DrawError('NO_SNAPSHOT');

  const previousWinners = new Set(await store.listPreviousWinnerNames(meetingId));

  const pool = active.participants
    .filter((p: StoredParticipant) => p.eligible && !previousWinners.has(p.normalizedName))
    .map((p) => ({ id: p.id, name: p.displayName }));

  return { snapshotId: active.snapshot.id, pool };
}

export interface RunDrawInput {
  meetingId: string;
  requestedWinners: number;
  countdownSeconds: number;
  actor: Actor;
}

/**
 * Ejecuta un sorteo completo.
 *
 * El orden importa: primero se congela y se registra el pool con su huella, y
 * recien despues se sortea. Asi, si algo falla a mitad de camino, queda evidencia
 * de sobre que universo se iba a sortear.
 */
export async function executeDraw(input: RunDrawInput): Promise<DrawWithWinners> {
  const store = getStore();
  const { snapshotId, pool } = await buildPool(input.meetingId);

  if (pool.length === 0) throw new DrawError('EMPTY_POOL');

  const countdownSeconds = normalizeCountdown(input.countdownSeconds);
  const actualWinners = normalizeWinnerCount(input.requestedWinners, pool.length);

  const draw = await store.createDraw({
    meetingId: input.meetingId,
    snapshotId,
    requestedWinners: input.requestedWinners,
    countdownSeconds,
    poolSize: pool.length,
    poolHash: hashPool(pool),
    actor: input.actor,
  });

  await store.audit({
    action: 'DRAW_STARTED',
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    meetingId: input.meetingId,
    snapshotId,
    drawId: draw.id,
    detail: {
      sequence: draw.sequence,
      poolSize: pool.length,
      poolHash: draw.poolHash,
      requestedWinners: input.requestedWinners,
      actualWinners,
      countdownSeconds,
    },
  });

  const outcome = runDraw({ pool, requestedWinners: input.requestedWinners });

  const result = await store.completeDraw(
    draw.id,
    outcome.winners.map((w) => ({ participantId: w.id, winnerName: w.name })),
  );

  await store.audit({
    action: 'WINNER_SELECTED',
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    meetingId: input.meetingId,
    snapshotId,
    drawId: draw.id,
    detail: {
      winners: result.winners.map((w) => ({ position: w.position, name: w.winnerName })),
      poolHash: draw.poolHash,
      seedEntropy: outcome.seedEntropy,
    },
  });

  return result;
}

export interface AlAguaInput {
  winnerId: string;
  reason: string | null;
  actor: Actor;
}

/**
 * "Al agua" (seccion 12).
 *
 * NO reconsulta Zoom y NO crea un snapshot nuevo. Reutiliza exactamente el mismo
 * universo del sorteo original, quita al descalificado y a los ya premiados en ese
 * sorteo, y elige un reemplazo.
 */
export async function sendAlAgua(input: AlAguaInput): Promise<{ replaced: StoredWinner; replacement: StoredWinner }> {
  const store = getStore();

  const winner = await store.getWinner(input.winnerId);
  if (!winner) throw new DrawError('NO_SNAPSHOT');
  if (winner.status === 'VALIDATED') throw new DrawError('ALREADY_VALIDATED');

  const drawWithWinners = await store.getDraw(winner.drawId);
  if (!drawWithWinners) throw new DrawError('NO_SNAPSHOT');

  const snapshot = await store.getSnapshot(drawWithWinners.draw.snapshotId);
  if (!snapshot) throw new DrawError('NO_SNAPSHOT');

  const replaced = await store.markAlAgua(input.winnerId, input.reason, input.actor);

  // Mismo pool del sorteo original: elegibles del snapshot, menos ganadores
  // previos de la reunion, menos todos los que ya salieron en ESTE sorteo.
  const previousWinners = new Set(await store.listPreviousWinnerNames(drawWithWinners.draw.meetingId));
  const blocked = await store.listBlockedParticipantIds(winner.drawId);

  const pool: PoolEntry[] = snapshot.participants
    .filter((p) => p.eligible && !previousWinners.has(p.normalizedName))
    .map((p) => ({ id: p.id, name: p.displayName }));

  const replacementEntry = redrawOne(pool, blocked);
  if (!replacementEntry) throw new DrawError('NO_REPLACEMENT');

  const replacement = await store.addReplacementWinner(
    winner.drawId,
    input.winnerId,
    replacementEntry.id,
    replacementEntry.name,
  );

  await store.audit({
    action: 'WINNER_SELECTED',
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    meetingId: drawWithWinners.draw.meetingId,
    snapshotId: snapshot.snapshot.id,
    drawId: winner.drawId,
    detail: {
      replacementFor: replaced.winnerName,
      newWinner: replacement.winnerName,
      position: replacement.position,
      // Se deja constancia de que se uso el mismo snapshot, no una extraccion nueva.
      reusedSnapshotSequence: snapshot.snapshot.sequence,
    },
  });

  return { replaced, replacement };
}

export async function validateWinner(winnerId: string, actor: Actor): Promise<StoredWinner> {
  const store = getStore();
  const winner = await store.getWinner(winnerId);
  if (!winner) throw new DrawError('NO_SNAPSHOT');
  if (winner.status === 'AL_AGUA') throw new DrawError('DISQUALIFIED');

  return store.validateWinner(winnerId, actor);
}
