/**
 * Errores de Zoom traducidos a codigos de dominio (seccion 41).
 *
 * El operador NUNCA ve el error tecnico. Ve un mensaje de la seccion 41, resuelto
 * por i18n a partir de `code`. El detalle tecnico viaja en `technicalDetail` y solo
 * se muestra en el panel de diagnostico del administrador.
 */

export type ZoomErrorCode =
  | 'TOKEN_EXPIRED' // la cuenta necesita re-autenticarse
  | 'FORBIDDEN' // faltan scopes
  | 'PLAN_NOT_SUPPORTED' // Dashboard API requiere Business+
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE' // 5xx o red caida
  | 'MEETING_NOT_FOUND' // reunion inexistente o ya finalizada
  | 'NO_ACTIVE_MEETINGS'
  | 'NO_PARTICIPANTS'
  | 'UNKNOWN';

export class ZoomApiError extends Error {
  readonly code: ZoomErrorCode;
  readonly httpStatus: number | null;
  readonly zoomCode: number | null;
  readonly technicalDetail: string;
  /** true si tiene sentido reintentar la misma llamada. */
  readonly retryable: boolean;
  /** Segundos sugeridos antes de reintentar, si Zoom los indico. */
  readonly retryAfterSeconds: number | null;

  constructor(init: {
    code: ZoomErrorCode;
    httpStatus?: number | null;
    zoomCode?: number | null;
    technicalDetail: string;
    retryable?: boolean;
    retryAfterSeconds?: number | null;
  }) {
    super(`[zoom:${init.code}] ${init.technicalDetail}`);
    this.name = 'ZoomApiError';
    this.code = init.code;
    this.httpStatus = init.httpStatus ?? null;
    this.zoomCode = init.zoomCode ?? null;
    this.technicalDetail = init.technicalDetail;
    this.retryable = init.retryable ?? false;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  /** DTO seguro para el cliente: sin tokens, sin URLs internas, sin secretos. */
  toClientPayload(): { code: ZoomErrorCode; retryable: boolean; retryAfterSeconds: number | null } {
    return { code: this.code, retryable: this.retryable, retryAfterSeconds: this.retryAfterSeconds };
  }
}

interface ZoomErrorBody {
  code?: number;
  message?: string;
}

/**
 * Traduce una respuesta HTTP fallida de Zoom al codigo de dominio correspondiente.
 *
 * Codigos de Zoom relevantes:
 *   124 -> access token invalido o expirado
 *   200 -> la cuenta no tiene permisos / plan para este recurso
 *   300x (3001) -> la reunion no existe o ya termino
 *   1001 -> usuario no existe en la cuenta
 */
export function mapZoomHttpError(status: number, body: ZoomErrorBody | null, rawText: string): ZoomApiError {
  const zoomCode = body?.code ?? null;
  const detail = body?.message ?? rawText.slice(0, 500);

  if (status === 401 || zoomCode === 124) {
    return new ZoomApiError({ code: 'TOKEN_EXPIRED', httpStatus: status, zoomCode, technicalDetail: detail });
  }

  if (status === 403 || zoomCode === 200) {
    // Zoom usa 400/403 con code 200 tanto para "sin scope" como para "plan insuficiente".
    // El texto es lo unico que los distingue.
    const isPlan = /plan|subscription|feature|dashboard/i.test(detail);
    return new ZoomApiError({
      code: isPlan ? 'PLAN_NOT_SUPPORTED' : 'FORBIDDEN',
      httpStatus: status,
      zoomCode,
      technicalDetail: detail,
    });
  }

  if (status === 404 || zoomCode === 3001 || zoomCode === 1001) {
    return new ZoomApiError({
      code: 'MEETING_NOT_FOUND',
      httpStatus: status,
      zoomCode,
      technicalDetail: detail,
    });
  }

  if (status === 429) {
    // Zoom devuelve dos mensajes distintos: limite por segundo (reintentable enseguida)
    // y limite diario (no sirve reintentar).
    const daily = /daily/i.test(detail);
    return new ZoomApiError({
      code: 'RATE_LIMITED',
      httpStatus: status,
      zoomCode,
      technicalDetail: detail,
      retryable: !daily,
      retryAfterSeconds: daily ? null : 2,
    });
  }

  if (status >= 500) {
    return new ZoomApiError({
      code: 'UNAVAILABLE',
      httpStatus: status,
      zoomCode,
      technicalDetail: detail,
      retryable: true,
    });
  }

  return new ZoomApiError({ code: 'UNKNOWN', httpStatus: status, zoomCode, technicalDetail: detail });
}

export function timeoutError(ms: number): ZoomApiError {
  return new ZoomApiError({
    code: 'TIMEOUT',
    technicalDetail: `Zoom no respondio en ${ms} ms.`,
    retryable: true,
  });
}

export function networkError(cause: unknown): ZoomApiError {
  return new ZoomApiError({
    code: 'UNAVAILABLE',
    technicalDetail: cause instanceof Error ? cause.message : String(cause),
    retryable: true,
  });
}
