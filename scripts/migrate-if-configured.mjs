/**
 * Aplica las migraciones de Prisma, pero solo si hay base de datos configurada.
 *
 * Se ejecuta como parte de `npm run build`. Sin este guardia, un build local o en
 * CI sin DATABASE_URL fallaria en `prisma migrate deploy`, cuando en realidad no
 * hay nada que migrar: la aplicacion funciona con el almacen en memoria.
 *
 * En Vercel, con DATABASE_URL definida, el despliegue crea o actualiza las tablas
 * solo, sin pasos manuales.
 */

import { spawnSync } from 'node:child_process';

const url = process.env.DATABASE_URL?.trim();

if (!url) {
  console.log('Sin DATABASE_URL: se omiten las migraciones (la app usara memoria).');
  process.exit(0);
}

console.log('DATABASE_URL detectada: aplicando migraciones...');

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  console.error(
    '\nLas migraciones fallaron. Revisa que DIRECT_URL apunte a la conexion DIRECTA\n' +
      'de la base (no al pooler): el pooler no admite sentencias de migracion.',
  );
  process.exit(result.status ?? 1);
}
