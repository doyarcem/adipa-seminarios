import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * Puente para la conexion directa.
 *
 * El esquema declara `directUrl = env("DIRECT_URL")`, que Prisma exige aunque solo
 * la usen las migraciones. La integracion de Neon en Vercel crea esa conexion con
 * su propio nombre (`DATABASE_URL_UNPOOLED`) y marcada como sensible, de modo que
 * copiarla a mano a `DIRECT_URL` no siempre es posible desde el panel.
 *
 * Se rellena aqui, antes de instanciar el cliente, para que conectar la base no
 * exija ningun paso manual. La lista de nombres vive en scripts/resolve-direct-url.mjs
 * y la usa tambien el script de migracion, para que las dos rutas coincidan.
 */
const DIRECT_URL_CANDIDATES = ['DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING'] as const;

if (!process.env.DIRECT_URL?.trim()) {
  for (const name of DIRECT_URL_CANDIDATES) {
    const value = process.env[name]?.trim();
    if (value) {
      process.env.DIRECT_URL = value;
      break;
    }
  }
}

/**
 * Cliente Prisma unico por proceso.
 *
 * En desarrollo Next recarga los modulos en cada cambio; sin este cache cada
 * recarga abriria un pool nuevo hasta agotar las conexiones de Postgres.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
