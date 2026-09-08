/**
 * Cuentas de prueba del proveedor "Modo prueba".
 *
 * REGLA DE SEGURIDAD: las credenciales viven SOLO en el entorno del servidor
 * (`DEMO_LOGIN_ACCOUNTS`), nunca en el codigo fuente ni en el bundle del navegador.
 * La variable NO lleva prefijo `NEXT_PUBLIC_`, de modo que Next.js jamas la incluye
 * en el JavaScript que se envia al cliente. La contrasena solo se compara aqui, en
 * servidor, con una comparacion de tiempo constante.
 *
 * Formato de `DEMO_LOGIN_ACCOUNTS`: pares `correo:contrasena` separados por comas o
 * saltos de linea. El correo no puede contener ":"; la contrasena si (se corta en el
 * PRIMER ":"). Ejemplo (los valores reales van en .env.local, no aqui):
 *
 *   DEMO_LOGIN_ACCOUNTS="monitor.demo@gmail.com:<clave>,admin.demo@adipa.cl:<clave>"
 *
 * El rol NO se define aqui: se deriva del dominio del correo en `resolveRole()`,
 * igual que en produccion. Este modulo solo decide si el correo+contrasena son validos.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** Parsea `DEMO_LOGIN_ACCOUNTS` a un mapa correo(minuscula) -> contrasena. */
export function parseDemoAccounts(raw: string | undefined): Map<string, string> {
  const accounts = new Map<string, string>();
  if (!raw) return accounts;

  for (const entry of raw.split(/[,\n]/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf(':');
    if (separator <= 0) continue; // sin ":" o sin correo antes del ":"

    const email = trimmed.slice(0, separator).trim().toLowerCase();
    const password = trimmed.slice(separator + 1);
    if (!email || !password) continue;

    accounts.set(email, password);
  }

  return accounts;
}

/**
 * Comparacion de tiempo constante e independiente de la longitud.
 *
 * Se comparan los hashes SHA-256 (siempre 32 bytes) en vez de las cadenas crudas:
 * asi `timingSafeEqual` nunca ve longitudes distintas -que lanzaria- y no se filtra
 * la longitud de la contrasena por el tiempo de respuesta.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Valida un intento de login contra las cuentas de prueba del entorno.
 * Devuelve true solo si el correo existe y la contrasena coincide exactamente.
 */
export function verifyDemoLogin(
  raw: string | undefined,
  email: string,
  password: string,
): boolean {
  const accounts = parseDemoAccounts(raw);
  const expected = accounts.get(email.trim().toLowerCase());

  if (expected === undefined) {
    // Se ejecuta una comparacion igual de costosa aunque el correo no exista, para
    // no delatar por tiempo si un correo esta o no configurado.
    constantTimeEqual(password, password);
    return false;
  }

  return constantTimeEqual(password, expected);
}
