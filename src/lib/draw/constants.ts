/**
 * Constantes y normalizaciones del sorteo.
 *
 * Vive aparte del motor a proposito: el motor importa `node:crypto` y por lo tanto
 * solo puede correr en servidor, mientras que el panel de configuracion es un
 * componente de cliente que necesita estos mismos limites. Separarlos evita
 * arrastrar codigo de servidor al bundle del navegador.
 *
 * Ambos lados normalizan con las MISMAS funciones: la UI para no ofrecer valores
 * invalidos, el servidor para no confiar en lo que llega del cliente.
 */

/** Maximo de ganadores por sorteo (seccion 51). */
export const MAX_WINNERS_PER_DRAW = 20;
export const DEFAULT_WINNERS = 1;

export const DEFAULT_COUNTDOWN_SECONDS = 5;
export const COUNTDOWN_PRESETS = [5, 6, 7, 8, 9, 10, 15, 30, 60] as const;
/** Limite razonable para la cuenta regresiva manual (seccion 26). */
export const MAX_COUNTDOWN_SECONDS = 600;

export function normalizeWinnerCount(requested: number, poolSize: number): number {
  const clamped = Math.max(1, Math.min(Math.floor(requested) || 1, MAX_WINNERS_PER_DRAW));
  // Seccion 23: pedir mas ganadores que elegibles NO es un error.
  return Math.min(clamped, poolSize);
}

export function normalizeCountdown(seconds: number): number {
  const value = Math.floor(seconds);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_COUNTDOWN_SECONDS;
  return Math.min(value, MAX_COUNTDOWN_SECONDS);
}
