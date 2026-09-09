/**
 * Resuelve la conexion DIRECTA a Postgres (sin pooler).
 *
 * Prisma exige `DIRECT_URL` para las migraciones: el pooler de Neon no admite las
 * sentencias que estas necesitan. La integracion de Neon en Vercel ya crea esa
 * conexion, pero con nombres propios y marcada como sensible, asi que copiarla a
 * mano a `DIRECT_URL` no siempre es posible desde el panel.
 *
 * Este modulo la busca por los nombres conocidos, en orden de preferencia, para
 * que conectar la base en Vercel no exija ningun paso manual.
 *
 * Se usa desde el script de migracion y desde `src/lib/db.ts`.
 */

/**
 * Nombres de la conexion SIN pooler, de mas a menos preferente.
 *
 * `DIRECT_URL` primero, por si alguien la define a mano; despues las que crea la
 * integracion de Neon en Vercel.
 */
const CANDIDATES = ['DIRECT_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING'];

/** Devuelve { url, source } con la primera conexion directa encontrada, o null. */
export function resolveDirectUrl(env) {
  for (const name of CANDIDATES) {
    const value = env[name]?.trim();
    if (value) return { url: value, source: name };
  }
  return null;
}
