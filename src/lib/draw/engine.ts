/**
 * Motor de sorteo.
 *
 * Requisitos que este modulo garantiza:
 *  - Aleatoriedad criptografica (seccion 25). NUNCA Math.random().
 *  - El universo se congela al iniciar y queda con huella verificable (seccion 55).
 *  - Si se piden mas ganadores que elegibles, se entregan los disponibles sin error (seccion 23).
 *  - "Al agua" re-sortea sobre el MISMO pool, sin reconsultar Zoom (seccion 12).
 */

import { createHash, randomBytes, randomInt } from 'node:crypto';
import { MAX_WINNERS_PER_DRAW, normalizeWinnerCount } from './constants';

export {
  COUNTDOWN_PRESETS,
  DEFAULT_COUNTDOWN_SECONDS,
  DEFAULT_WINNERS,
  MAX_COUNTDOWN_SECONDS,
  MAX_WINNERS_PER_DRAW,
  normalizeCountdown,
  normalizeWinnerCount,
} from './constants';


export interface PoolEntry {
  /** id del SnapshotParticipant. */
  id: string;
  name: string;
}

export interface DrawInput {
  pool: readonly PoolEntry[];
  requestedWinners: number;
}

export interface DrawOutcome {
  winners: PoolEntry[];
  poolSize: number;
  /** SHA-256 de los ids del pool ordenados. Permite auditar sobre que conjunto se sorteo. */
  poolHash: string;
  /** Entropia adicional registrada junto al sorteo, para trazabilidad. */
  seedEntropy: string;
  requestedWinners: number;
  actualWinners: number;
}

/**
 * Huella del universo de participantes. Se ordena por id para que el hash no
 * dependa del orden en que la base devolvio las filas.
 */
export function hashPool(pool: readonly PoolEntry[]): string {
  const ids = pool.map((e) => e.id).sort();
  return createHash('sha256').update(ids.join('\n'), 'utf8').digest('hex');
}

/**
 * Baraja parcial de Fisher-Yates usando crypto.randomInt (CSPRNG del sistema).
 *
 * randomInt evita el sesgo del modulo que tendria `randomBytes() % n`: descarta
 * y reintenta hasta caer en un rango uniforme. Por eso se usa en vez de derivar
 * el indice a mano.
 */
export function pickRandom<T>(items: readonly T[], count: number): T[] {
  const n = Math.min(count, items.length);
  if (n <= 0) return [];

  const arr = [...items];
  for (let i = 0; i < n; i++) {
    const j = randomInt(i, arr.length);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

/** Ejecuta un sorteo sobre un pool ya congelado. Funcion sin I/O. */
export function runDraw({ pool, requestedWinners }: DrawInput): DrawOutcome {
  const actualWinners = normalizeWinnerCount(requestedWinners, pool.length);
  const winners = pickRandom(pool, actualWinners);

  return {
    winners,
    poolSize: pool.length,
    poolHash: hashPool(pool),
    seedEntropy: randomBytes(16).toString('hex'),
    requestedWinners: Math.max(1, Math.min(Math.floor(requestedWinners) || 1, MAX_WINNERS_PER_DRAW)),
    actualWinners,
  };
}

/**
 * "Al agua" (seccion 12): el ganador descalificado sale del pool y se elige UNO nuevo
 * sobre el MISMO universo. No se reconsulta Zoom ni se crea un snapshot nuevo.
 *
 * @param pool          el mismo pool congelado del sorteo original
 * @param excludedIds   ganadores anteriores del sorteo + los ya enviados al agua
 */
export function redrawOne(pool: readonly PoolEntry[], excludedIds: readonly string[]): PoolEntry | null {
  const blocked = new Set(excludedIds);
  const remaining = pool.filter((e) => !blocked.has(e.id));
  if (remaining.length === 0) return null;
  return pickRandom(remaining, 1)[0];
}
