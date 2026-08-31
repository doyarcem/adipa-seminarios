'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/server/authz';
import { getStore } from '@/server/context';
import { DrawError, executeDraw, sendAlAgua, validateWinner } from '@/server/services/draws';

export interface WinnerDto {
  id: string;
  name: string;
  position: number;
  status: string;
}

export interface DrawResultDto {
  ok: boolean;
  error?: string;
  drawId?: string;
  sequence?: number;
  poolSize?: number;
  winners?: WinnerDto[];
}

const toDto = (w: { id: string; winnerName: string; position: number; status: string }): WinnerDto => ({
  id: w.id,
  name: w.winnerName,
  position: w.position,
  status: w.status,
});

/**
 * Ejecuta el sorteo (seccion 25).
 *
 * IMPORTANTE: el resultado se decide y se persiste AQUI, en el servidor, antes de
 * que empiece la animacion. La cuenta regresiva y la ruleta son puesta en escena
 * sobre un resultado ya determinado y auditado. Hacerlo al reves -animar primero y
 * resolver despues- significaria que una caida de red a mitad del espectaculo
 * dejaria al operador sin ganador delante de la audiencia.
 */
export async function runDrawAction(
  meetingId: string,
  requestedWinners: number,
  countdownSeconds: number,
): Promise<DrawResultDto> {
  const ctx = await requirePermission('draw.run');

  try {
    const { draw, winners } = await executeDraw({
      meetingId,
      requestedWinners,
      countdownSeconds,
      actor: { userId: ctx.userId, email: ctx.email, name: ctx.name },
    });

    revalidatePath(`/operador/${meetingId}`);

    return {
      ok: true,
      drawId: draw.id,
      sequence: draw.sequence,
      poolSize: draw.poolSize,
      winners: winners.map(toDto),
    };
  } catch (error) {
    if (error instanceof DrawError) return { ok: false, error: error.code };
    throw error;
  }
}

/** "Al agua": descalifica y re-sortea sobre el mismo snapshot (seccion 12). */
export async function alAguaAction(
  meetingId: string,
  winnerId: string,
  reason: string | null,
): Promise<DrawResultDto> {
  const ctx = await requirePermission('draw.alAgua');

  try {
    const { replacement } = await sendAlAgua({
      winnerId,
      reason: reason?.trim() || null,
      actor: { userId: ctx.userId, email: ctx.email, name: ctx.name },
    });

    const store = getStore();
    const draw = await store.getDraw(replacement.drawId);
    revalidatePath(`/operador/${meetingId}`);

    return {
      ok: true,
      drawId: replacement.drawId,
      winners: draw?.winners.filter((w) => w.status !== 'AL_AGUA').map(toDto) ?? [toDto(replacement)],
    };
  } catch (error) {
    if (error instanceof DrawError) return { ok: false, error: error.code };
    throw error;
  }
}

/** Validacion del ganador por parte del operador (seccion 33). */
export async function validateWinnerAction(
  meetingId: string,
  winnerId: string,
): Promise<{ ok: boolean; error?: string; validatedByName?: string | null; validatedAt?: string }> {
  const ctx = await requirePermission('winner.validate');

  try {
    const winner = await validateWinner(winnerId, {
      userId: ctx.userId,
      email: ctx.email,
      name: ctx.name,
    });

    revalidatePath(`/operador/${meetingId}`);

    return {
      ok: true,
      validatedByName: winner.validatedByName,
      validatedAt: winner.validatedAt?.toISOString(),
    };
  } catch (error) {
    if (error instanceof DrawError) return { ok: false, error: error.code };
    throw error;
  }
}
