/**
 * Resolucion de roles (secciones 5, 6 y 40).
 *
 * REGLA CRITICA: el rol se calcula SIEMPRE en servidor a partir del email verificado
 * por el proveedor de identidad. Nunca se lee del cliente, nunca se acepta desde el
 * navegador y nunca viaja en un formulario.
 *
 * Modulo puro: sin I/O, sin Prisma, sin next-auth. Asi se puede testear entero.
 */

export type Role = 'ADMIN' | 'OPERATOR';

const DEFAULT_ADMIN_DOMAINS = ['adipa.cl', 'adipa.co', 'adipa.mx'] as const;

/**
 * Dominios que otorgan rol ADMINISTRADOR automaticamente (seccion 6).
 * Configurables por entorno, con los tres oficiales como valor por defecto.
 */
export function getAdminDomains(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ADIPA_ADMIN_DOMAINS?.trim();
  if (!raw) return [...DEFAULT_ADMIN_DOMAINS];

  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => d.length > 0);
}

/**
 * Extrae el dominio de un email.
 *
 * Se toma el ULTIMO "@" para que "a@b"@adipa.cl no pueda hacerse pasar por otro dominio,
 * y se rechaza cualquier cosa que no tenga exactamente la forma esperada.
 */
export function extractDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;

  const domain = normalized.slice(at + 1);
  // Un dominio valido no lleva espacios, ni "@", ni empieza o termina en punto.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return domain;
}

/**
 * Decide el rol a partir del email. Devuelve tambien si el rol queda BLOQUEADO,
 * es decir, si proviene de la regla de dominio y por tanto ningun administrador
 * puede degradarlo desde la UI.
 */
export function resolveRole(
  email: string,
  env: NodeJS.ProcessEnv = process.env,
): { role: Role; lockedByDomain: boolean } {
  const domain = extractDomain(email);
  if (!domain) return { role: 'OPERATOR', lockedByDomain: false };

  const adminDomains = getAdminDomains(env);
  // Coincidencia exacta de dominio. "notadipa.cl" o "adipa.cl.evil.com" NO califican.
  const isAdmin = adminDomains.includes(domain);

  return isAdmin ? { role: 'ADMIN', lockedByDomain: true } : { role: 'OPERATOR', lockedByDomain: false };
}

/**
 * Quien puede entrar a la aplicacion.
 *
 * Sin esto, cualquier persona con una cuenta Google entraria como OPERADOR.
 * Solo pasan: los dominios ADIPA (admins) y los emails que un administrador
 * ya creo como operador en la base de datos.
 */
export function canSignIn(
  email: string,
  knownOperatorEmails: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const domain = extractDomain(email);
  if (!domain) return false;

  if (getAdminDomains(env).includes(domain)) return true;

  const normalized = email.trim().toLowerCase();
  return knownOperatorEmails.some((known) => known.trim().toLowerCase() === normalized);
}

/** Permisos por rol (seccion 5). Fuente unica: si no esta aqui, no se puede. */
export const PERMISSIONS = {
  ADMIN: [
    'zoom.link',
    'zoom.unlink',
    'zoom.view',
    'users.manage',
    'history.viewGlobal',
    'settings.manage',
    'audit.view',
    'meetings.select',
    'participants.extract',
    'participants.override',
    'draw.run',
    'draw.alAgua',
    'winner.validate',
    'results.export',
  ],
  OPERATOR: [
    'zoom.view',
    'meetings.select',
    'participants.extract',
    'participants.override',
    'draw.run',
    'draw.alAgua',
    'winner.validate',
    'results.export',
  ],
} as const;

export type Permission = (typeof PERMISSIONS)['ADMIN'][number];

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[role] as readonly string[]).includes(permission);
}
