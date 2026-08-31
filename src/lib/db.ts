import 'server-only';
import { PrismaClient } from '@prisma/client';

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
