'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { extractParticipantsAction, type ActionResult } from '@/server/actions/meetings';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface SnapshotSummary {
  id: string;
  sequence: number;
  capturedAt: string;
  totalFound: number;
  totalEligible: number;
  totalExcluded: number;
}

interface Props {
  meetingId: string;
  snapshot: SnapshotSummary | null;
  snapshotCount: number;
}

/** Estados de progreso de la extraccion (seccion 42). */
const STEPS = ['connecting', 'queryingMeeting', 'fetchingParticipants', 'processing', 'applyingRules'] as const;

export function ExtractionPanel({ meetingId, snapshot, snapshotCount }: Props) {
  const t = useTranslations('participants');
  const tx = useTranslations('extraction');
  const tc = useTranslations('confirm');
  const tz = useTranslations('zoomErrors');
  const locale = useLocale();

  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<ActionResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  /**
   * Los pasos avanzan solos mientras la accion corre. No son un porcentaje real
   * -el servidor no reporta progreso-, sino una senal de que el sistema sigue
   * trabajando: el requisito de la seccion 43 es que el operador nunca vea una
   * pantalla en blanco sin saber que pasa.
   */
  useEffect(() => {
    if (!pending) {
      setStep(0);
      return;
    }
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 600);
    return () => clearInterval(timer);
  }, [pending]);

  const run = () => {
    setError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await extractParticipantsAction(meetingId);
      if (!result.ok) setError(result);
    });
  };

  const capturedAt = snapshot ? new Date(snapshot.capturedAt) : null;

  return (
    <section className="adipa-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight text-fg-default">
            {t('snapshotTitle')}
          </h2>
          {capturedAt ? (
            <p className="mt-1 text-[13px] text-fg-muted">
              {t('capturedAt', {
                date: capturedAt.toLocaleDateString(locale),
                time: capturedAt.toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              })}
              <span className="ml-2 rounded-full bg-brand-surface-soft px-2 py-0.5 text-[11px] font-semibold text-brand-primary">
                #{snapshot!.sequence}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-fg-muted">
              Todavía no se han extraído participantes de esta reunión.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {snapshot ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={pending}
              className="rounded-adipa-control border border-border-subtle bg-white px-4 py-2.5 text-[14px] font-semibold text-fg-default transition hover:border-brand-primary/30 disabled:opacity-60"
            >
              {t('refresh')}
            </button>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="adipa-gradient rounded-adipa-control px-5 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {t('extract')}
            </button>
          )}
        </div>
      </div>

      {pending && (
        <div
          role="status"
          aria-live="polite"
          className="mt-5 rounded-adipa-card border border-brand-lavender bg-brand-surface-soft px-4 py-3"
        >
          <p className="text-[14px] font-semibold text-brand-primary">{tx(STEPS[step])}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white">
            <div
              className="adipa-gradient h-full transition-all duration-500"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && !pending && (
        <div
          role="alert"
          className="mt-5 rounded-adipa-card border border-state-error/40 bg-state-error/5 px-4 py-3"
        >
          <p className="text-[14px] font-medium leading-relaxed text-fg-default">
            {tz(error.zoomError ?? 'UNKNOWN')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              className="rounded-adipa-control bg-brand-primary px-3.5 py-1.5 text-[13px] font-semibold text-white"
            >
              Reintentar
            </button>
            <span className="text-[13px] text-fg-muted">
              o usa el <strong className="font-semibold">{tz('useManualDb')}</strong>
            </span>
          </div>
          {error.technicalDetail && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-fg-subtle">
                {tz('technicalDetails')}
              </summary>
              <p className="mt-2 break-words font-mono text-[11px] text-fg-subtle">
                {error.technicalDetail}
              </p>
            </details>
          )}
        </div>
      )}

      {snapshot && !pending && (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-4">
            <Stat label={t('found')} value={snapshot.totalFound} />
            <Stat label={t('eligible')} value={snapshot.totalEligible} tone="success" />
            <Stat label={t('excluded')} value={snapshot.totalExcluded} tone="muted" />
          </dl>

          <p className="mt-5 border-t border-border-subtle pt-4 text-[12px] leading-relaxed text-fg-subtle">
            {t('snapshotNotice')}
            {snapshotCount > 1 && ` Se conservan ${snapshotCount} snapshots de esta reunión.`}
          </p>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={tc('refreshTitle')}
        body={tc('refreshBody')}
        confirmLabel={tc('refreshAction')}
        onConfirm={run}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'muted';
}) {
  const color =
    tone === 'success'
      ? 'text-brand-primary'
      : tone === 'muted'
        ? 'text-fg-subtle'
        : 'text-fg-default';

  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase leading-tight tracking-[0.05em] text-fg-subtle">
        {label}
      </dt>
      <dd className={`mt-1 text-[28px] font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
