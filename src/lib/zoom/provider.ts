/**
 * Contrato comun entre el cliente real de Zoom y el simulador.
 *
 * Todo el resto de la aplicacion depende de esta interfaz, nunca de la clase
 * concreta. Asi el simulador no es un parche de desarrollo: es una implementacion
 * intercambiable del mismo contrato, y el codigo de produccion no tiene ni una
 * rama `if (esSimulador)`.
 */

import type {
  ZoomAccountUser,
  ZoomLiveMeeting,
  ZoomLiveParticipant,
  ZoomMeetingSettings,
} from './client';

export interface ZoomProvider {
  /** Reuniones en vivo de toda la cuenta (seccion 9). */
  listLiveMeetings(): Promise<ZoomLiveMeeting[]>;

  /** Participantes conectados en este momento (seccion 10). */
  listLiveParticipants(meetingUuid: string): Promise<ZoomLiveParticipant[]>;

  /** Detalle de la reunion: host_email y alternative_hosts para la cascada de roles. */
  getMeetingSettings(meetingId: string): Promise<ZoomMeetingSettings>;

  /** Usuarios internos de la cuenta. Se usan para marcar STAFF, no para excluir. */
  listAccountUsers(): Promise<ZoomAccountUser[]>;
}

export type ZoomMode = 'live' | 'simulator';

/**
 * Modo de operacion. El simulador solo se activa con una variable de entorno
 * explicita: si alguien despliega a produccion sin credenciales, la app falla
 * con un error claro en vez de sortear sobre datos inventados.
 */
export function getZoomMode(env: NodeJS.ProcessEnv = process.env): ZoomMode {
  return env.ZOOM_MODE === 'simulator' ? 'simulator' : 'live';
}

/** true si hay credenciales reales configuradas. */
export function hasLiveCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ZOOM_CLIENT_ID?.trim() && env.ZOOM_CLIENT_SECRET?.trim());
}
