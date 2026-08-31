/**
 * Construye el contexto de roles para el motor de elegibilidad.
 *
 * POR QUE EXISTE ESTE MODULO: la Dashboard API entrega los participantes con
 * `user_id`, pero la configuracion de la reunion entrega los co-anfitriones como
 * EMAILS (`settings.alternative_hosts`). Son identificadores distintos y no se
 * pueden comparar entre si.
 *
 * El puente es `GET /users`, que devuelve id y email de cada usuario interno.
 * Sin este paso los co-anfitriones nunca se detectarian, aunque estuvieran
 * correctamente declarados en Zoom.
 */

import type { ZoomAccountUser, ZoomMeetingSettings } from './client';
import type { EligibilityContext } from '../eligibility/types';

/** `alternative_hosts` llega como una cadena de emails separados por ";" o ",". */
export function parseAlternativeHosts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

const emailKey = (v: string) => v.trim().toLowerCase();

/** Resuelve emails a IDs de usuario Zoom usando el directorio de la cuenta. */
export function resolveZoomUserIds(
  emails: readonly string[],
  accountUsers: readonly ZoomAccountUser[],
): string[] {
  const byEmail = new Map(accountUsers.map((u) => [emailKey(u.email), u.id]));
  return emails
    .map((e) => byEmail.get(emailKey(e)))
    .filter((id): id is string => Boolean(id));
}

export interface RoleContextInput {
  settings: ZoomMeetingSettings | null;
  accountUsers: readonly ZoomAccountUser[];
  /** Co-anfitriones que el administrador mantiene a mano (mitigacion seccion 16). */
  knownCoHostEmails?: readonly string[];
  /** Nombre del host segun la lista de reuniones, como evidencia de ultimo recurso. */
  hostName?: string | null;
}

export function buildRoleContext({
  settings,
  accountUsers,
  knownCoHostEmails = [],
  hostName = null,
}: RoleContextInput): EligibilityContext {
  const alternativeHostEmails = parseAlternativeHosts(settings?.settings?.alternative_hosts);

  return {
    hostEmail: settings?.host_email ?? null,
    hostZoomUserId: settings?.host_id ?? null,
    hostName,

    alternativeHostEmails,
    alternativeHostZoomUserIds: resolveZoomUserIds(alternativeHostEmails, accountUsers),

    knownCoHostEmails,
    knownCoHostZoomUserIds: resolveZoomUserIds(knownCoHostEmails, accountUsers),

    accountMemberEmails: accountUsers.map((u) => u.email),
    accountMemberZoomUserIds: accountUsers.map((u) => u.id),
  };
}
