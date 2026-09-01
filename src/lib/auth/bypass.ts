/**
 * Modo de vista previa sin autenticacion.
 *
 * Existe para poder recorrer la aplicacion mientras no hay credenciales de Zoom
 * ni de Google. Salta el login por completo y entrega una sesion sintetica.
 *
 * DOS CANDADOS, y hacen falta los dos:
 *   1. AUTH_BYPASS=true, que hay que poner a mano
 *   2. NODE_ENV distinto de "production"
 *
 * Asi, si alguien despliega con la variable puesta por descuido, el entorno lo
 * bloquea igual. Ademas la interfaz muestra un aviso permanente e imposible de
 * ignorar mientras el modo esta activo.
 */

import type { Role } from './roles';

/** Cookie donde se guarda el rol elegido durante la vista previa. */
export const PREVIEW_ROLE_COOKIE = 'adipa-preview-role';

export function isAuthBypassEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_BYPASS === 'true' && env.NODE_ENV !== 'production';
}

export interface PreviewIdentity {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

const PREVIEW_IDENTITIES: Record<Role, PreviewIdentity> = {
  OPERATOR: {
    userId: 'preview-operator',
    email: 'sala1.virtualys@gmail.com',
    name: 'Monitor (vista previa)',
    role: 'OPERATOR',
  },
  ADMIN: {
    userId: 'preview-admin',
    email: 'vista.previa@adipa.cl',
    name: 'Administradora (vista previa)',
    role: 'ADMIN',
  },
};

/**
 * Identidad sintetica para la vista previa.
 *
 * Los correos elegidos NO son arbitrarios: son ejemplos reales de cada caso, de
 * modo que la regla de dominio de la seccion 6 sigue siendo coherente con el rol
 * mostrado (un @adipa.cl es administrador, un gmail es operador).
 */
export function getPreviewIdentity(role: Role): PreviewIdentity {
  return PREVIEW_IDENTITIES[role];
}

export function isRole(value: unknown): value is Role {
  return value === 'ADMIN' || value === 'OPERATOR';
}
