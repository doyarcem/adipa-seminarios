/**
 * Cliente HTTP de Zoom.
 *
 * Reglas que respeta (secciones 40, 41, 42, 53):
 *  - Vive SOLO en servidor. Los secretos nunca cruzan al navegador.
 *  - Timeout duro por request y backoff exponencial con jitter en 429/5xx/timeout.
 *  - Refresh de token serializado por cuenta: Zoom ROTA el refresh token en cada uso,
 *    dos refrescos en paralelo invalidarian la cuenta.
 *  - Pagina hasta agotar next_page_token (1.000 participantes = 4 paginas de 300).
 */

import 'server-only';
import { ZoomApiError, mapZoomHttpError, networkError, timeoutError } from './errors';

const ZOOM_API_BASE = 'https://api.zoom.us/v2';
const ZOOM_OAUTH_TOKEN_URL = 'https://zoom.us/oauth/token';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
/** Margen para refrescar antes de que el token expire de verdad. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
/** Maximo permitido por la API de Dashboard. */
export const MAX_PAGE_SIZE = 300;
/** Corta la paginacion ante una respuesta anomala de Zoom (seccion 22: tope esperado 1.000). */
const MAX_PAGES = 20;

export interface ZoomTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

/**
 * Persistencia de tokens. Se inyecta para que el cliente no dependa de Prisma
 * y se pueda testear sin base de datos.
 */
export interface ZoomTokenStore {
  load(): Promise<ZoomTokens>;
  /** Debe guardar el refresh token ROTADO de inmediato. */
  save(tokens: ZoomTokens): Promise<void>;
  /** Se llama cuando el refresh falla de forma definitiva. */
  markNeedsReauth(reason: string): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Backoff exponencial con jitter completo: 250ms, 500ms, 1s (+/- aleatorio). */
function backoffDelay(attempt: number, retryAfterSeconds: number | null): number {
  if (retryAfterSeconds) return retryAfterSeconds * 1000;
  const base = 250 * 2 ** attempt;
  return Math.round(base / 2 + Math.random() * (base / 2));
}

/**
 * Los UUID de instancia de reunion pueden empezar con "/" o contener "//".
 * En ese caso Zoom exige doble URL-encoding.
 */
export function encodeMeetingIdentifier(identifier: string): string {
  const once = encodeURIComponent(identifier);
  return identifier.startsWith('/') || identifier.includes('//') ? encodeURIComponent(once) : once;
}

// Un mutex por cuenta, en memoria del proceso. Evita refrescos concurrentes.
const refreshLocks = new Map<string, Promise<ZoomTokens>>();

export interface ZoomClientOptions {
  accountKey: string;
  store: ZoomTokenStore;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

export class ZoomClient {
  private readonly accountKey: string;
  private readonly store: ZoomTokenStore;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ZoomClientOptions) {
    this.accountKey = options.accountKey;
    this.store = options.store;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  // ─────────────────────────── tokens ───────────────────────────

  private async getAccessToken(forceRefresh = false): Promise<string> {
    const tokens = await this.store.load();
    const stillValid = tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS;
    if (stillValid && !forceRefresh) return tokens.accessToken;

    const inFlight = refreshLocks.get(this.accountKey);
    if (inFlight) return (await inFlight).accessToken;

    const promise = this.refreshTokens(tokens).finally(() => refreshLocks.delete(this.accountKey));
    refreshLocks.set(this.accountKey, promise);
    return (await promise).accessToken;
  }

  private async refreshTokens(current: ZoomTokens): Promise<ZoomTokens> {
    if (!current.refreshToken) {
      await this.store.markNeedsReauth('No hay refresh token almacenado.');
      throw new ZoomApiError({
        code: 'TOKEN_EXPIRED',
        technicalDetail: 'La cuenta no tiene refresh token; requiere volver a autorizar.',
      });
    }

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: current.refreshToken });

    const response = await this.fetchImpl(ZOOM_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      await this.store.markNeedsReauth(`Refresh fallido (${response.status}).`);
      throw new ZoomApiError({
        code: 'TOKEN_EXPIRED',
        httpStatus: response.status,
        technicalDetail: text.slice(0, 500),
      });
    }

    const json = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const next: ZoomTokens = {
      accessToken: json.access_token,
      // Zoom rota el refresh token: si viene uno nuevo, el anterior queda invalidado.
      refreshToken: json.refresh_token ?? current.refreshToken,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
    };

    await this.store.save(next);
    return next;
  }

  // ─────────────────────────── request ───────────────────────────

  private async request<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${ZOOM_API_BASE}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    let lastError: ZoomApiError | null = null;
    let refreshedOnce = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const token = await this.getAccessToken(refreshedOnce);

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: 'no-store',
        });
      } catch (cause) {
        lastError =
          cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')
            ? timeoutError(REQUEST_TIMEOUT_MS)
            : networkError(cause);
        await sleep(backoffDelay(attempt, null));
        continue;
      }

      if (response.ok) return (await response.json()) as T;

      const rawText = await response.text();
      let parsed: { code?: number; message?: string } | null = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }

      lastError = mapZoomHttpError(response.status, parsed, rawText);

      // Un 401 merece exactamente un intento de refresh, no un bucle.
      if (lastError.code === 'TOKEN_EXPIRED' && !refreshedOnce) {
        refreshedOnce = true;
        continue;
      }

      if (!lastError.retryable) throw lastError;
      await sleep(backoffDelay(attempt, lastError.retryAfterSeconds));
    }

    throw lastError ?? new ZoomApiError({ code: 'UNKNOWN', technicalDetail: 'Sin respuesta de Zoom.' });
  }

  /** Recorre todas las paginas de un endpoint con next_page_token. */
  private async requestAllPages<TItem>(
    path: string,
    itemsKey: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<TItem[]> {
    const items: TItem[] = [];
    let nextPageToken: string | undefined;
    let pages = 0;

    do {
      const page = await this.request<Record<string, unknown>>(path, {
        ...params,
        page_size: MAX_PAGE_SIZE,
        next_page_token: nextPageToken,
      });

      const batch = page[itemsKey];
      if (Array.isArray(batch)) items.push(...(batch as TItem[]));

      const token = page.next_page_token;
      nextPageToken = typeof token === 'string' && token.length > 0 ? token : undefined;
      pages++;
    } while (nextPageToken && pages < MAX_PAGES);

    return items;
  }

  // ─────────────────────────── endpoints ───────────────────────────

  /**
   * Reuniones EN VIVO de toda la cuenta (seccion 9, seccion 54).
   * Una sola llamada devuelve todas las instancias activas de la cuenta.
   */
  async listLiveMeetings(): Promise<ZoomLiveMeeting[]> {
    const today = new Date().toISOString().slice(0, 10);
    return this.requestAllPages<ZoomLiveMeeting>('/metrics/meetings', 'meetings', {
      type: 'live',
      from: today,
      to: today,
    });
  }

  /**
   * Participantes CONECTADOS AHORA (seccion 10).
   * Se pasa el UUID de la instancia, no el id numerico: con reuniones recurrentes o
   * simultaneas el id numerico es ambiguo.
   */
  async listLiveParticipants(meetingUuid: string): Promise<ZoomLiveParticipant[]> {
    const id = encodeMeetingIdentifier(meetingUuid);
    return this.requestAllPages<ZoomLiveParticipant>(`/metrics/meetings/${id}/participants`, 'participants', {
      type: 'live',
    });
  }

  /** Detalle de la reunion. Aporta host_email y alternative_hosts para la cascada de roles. */
  async getMeetingSettings(meetingId: string): Promise<ZoomMeetingSettings> {
    return this.request<ZoomMeetingSettings>(`/meetings/${encodeMeetingIdentifier(meetingId)}`);
  }

  /** Usuarios internos de la cuenta. Se usan para marcar STAFF, no para excluir. */
  async listAccountUsers(): Promise<ZoomAccountUser[]> {
    return this.requestAllPages<ZoomAccountUser>('/users', 'users', { status: 'active' });
  }
}

// ─────────────────────────── tipos de respuesta ───────────────────────────
// Reflejan el esquema real documentado. Ver docs/00-ZOOM-RESEARCH.md.
// NOTA: no existe campo `role` en los participantes. No agregarlo aqui.

export interface ZoomLiveMeeting {
  uuid: string;
  id: number;
  topic: string;
  host: string;
  email: string;
  user_type?: string;
  start_time: string;
  end_time?: string;
  duration?: string;
  participants?: number;
}

export interface ZoomLiveParticipant {
  id?: string;
  user_id?: string;
  user_name: string;
  device?: string;
  ip_address?: string;
  location?: string;
  network_type?: string;
  join_time?: string;
  leave_time?: string;
  pc_name?: string;
  domain?: string;
  version?: string;
}

export interface ZoomMeetingSettings {
  id: number;
  uuid: string;
  topic: string;
  host_id?: string;
  host_email?: string;
  settings?: { alternative_hosts?: string };
}

export interface ZoomAccountUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  status?: string;
}
