import { getTranslations } from 'next-intl/server';

interface Props {
  code: string;
  accountName?: string;
  technicalDetail?: string | null;
  /** Ofrece el respaldo por Excel cuando corresponde (seccion 20). */
  showManualDbHint?: boolean;
}

/**
 * Mensajes de error de Zoom en lenguaje del operador (seccion 41).
 *
 * Nunca muestra el error tecnico en el cuerpo: ese queda plegado en "Detalles
 * tecnicos", para diagnostico, no para la persona que esta sorteando en vivo.
 */
export async function ZoomErrorNotice({
  code,
  accountName,
  technicalDetail,
  showManualDbHint,
}: Props) {
  const t = await getTranslations('zoomErrors');
  const known = [
    'TOKEN_EXPIRED',
    'FORBIDDEN',
    'PLAN_NOT_SUPPORTED',
    'TIMEOUT',
    'RATE_LIMITED',
    'UNAVAILABLE',
    'MEETING_NOT_FOUND',
    'NO_ACTIVE_MEETINGS',
    'NO_PARTICIPANTS',
  ];

  return (
    <div
      role="alert"
      className="rounded-adipa-card border border-state-error/40 bg-state-error/5 px-5 py-4"
    >
      {accountName && (
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
          {accountName}
        </p>
      )}

      <p className="text-[14px] font-medium leading-relaxed text-fg-default">
        {t(known.includes(code) ? code : 'UNKNOWN')}
      </p>

      {showManualDbHint && (
        <p className="mt-3 text-[13px] text-fg-muted">
          También puedes usar el{' '}
          <strong className="font-semibold text-fg-default">{t('useManualDb')}</strong>.
        </p>
      )}

      {technicalDetail && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] font-semibold text-fg-subtle">
            {t('technicalDetails')}
          </summary>
          <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-fg-subtle">
            {technicalDetail}
          </p>
        </details>
      )}
    </div>
  );
}
