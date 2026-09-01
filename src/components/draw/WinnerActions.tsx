'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { alAguaAction, validateWinnerAction, type WinnerDto } from '@/server/actions/draws';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Props {
  meetingId: string;
  drawId: string | null;
  winners: WinnerDto[];
  onChanged: (winners: WinnerDto[]) => void;
}

/** Acciones sobre el ganador: copiar, validar y "Al agua" (secciones 12, 33 y 35). */
export function WinnerActions({ meetingId, drawId, winners, onChanged }: Props) {
  const tw = useTranslations('winner');
  const tc = useTranslations('confirm');
  const tCommon = useTranslations('common');

  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [validated, setValidated] = useState<Record<string, string | null>>({});
  const [alAguaTarget, setAlAguaTarget] = useState<WinnerDto | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const single = winners.length === 1;
  const allValidated = winners.every((w) => validated[w.id] !== undefined);

  const copy = async () => {
    // Con varios ganadores se copia una lista numerada, lista para pegar (seccion 35).
    const text = single
      ? winners[0].name
      : winners.map((w) => `${w.position}. ${w.name}`).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar al portapapeles.');
    }
  };

  const validate = (winner: WinnerDto) => {
    setError(null);
    startTransition(async () => {
      const result = await validateWinnerAction(meetingId, winner.id);
      if (result.ok) setValidated((v) => ({ ...v, [winner.id]: result.validatedByName ?? null }));
      else setError(result.error ?? 'UNKNOWN');
    });
  };

  const confirmAlAgua = () => {
    if (!alAguaTarget) return;
    const target = alAguaTarget;
    setAlAguaTarget(null);
    setError(null);

    startTransition(async () => {
      const result = await alAguaAction(meetingId, target.id, reason || null);
      setReason('');

      if (result.ok && result.winners) onChanged(result.winners);
      else setError(result.error === 'NO_REPLACEMENT' ? 'No quedan participantes disponibles.' : 'UNKNOWN');
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      {error && (
        <p role="alert" className="mb-3 text-center text-[13px] font-medium text-white">
          {error}
        </p>
      )}

      {/* Recordatorio de que validar es una comprobacion visual, no un tramite. */}
      {!allValidated && (
        <p className="mb-4 text-center text-[13px] text-white/80">{tw('validateHint')}</p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="rounded-adipa-control bg-white/15 px-5 py-2.5 text-[14px] font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/25"
        >
          {copied ? tCommon('copied') : single ? tw('copy') : tw('copyPlural')}
        </button>

        {single && (
          <>
            {validated[winners[0].id] !== undefined ? (
              <>
                <span className="rounded-adipa-control bg-white/15 px-5 py-2.5 text-[14px] font-bold text-white ring-1 ring-white/30">
                  ✓ {tw('validated')}
                </span>
                {/* El comprobante solo existe despues de validar (seccion 33). */}
                <a
                  href={`/api/comprobante/${winners[0].id}`}
                  className="rounded-adipa-control bg-white px-5 py-2.5 text-[14px] font-bold text-brand-primary transition hover:opacity-90"
                >
                  {tw('downloadCertificate')}
                </a>
              </>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => validate(winners[0])}
                className="rounded-adipa-control bg-white px-5 py-2.5 text-[14px] font-bold text-brand-primary transition hover:opacity-90 disabled:opacity-60"
              >
                {tw('validate')}
              </button>
            )}

            <button
              type="button"
              disabled={pending || validated[winners[0].id] !== undefined}
              onClick={() => setAlAguaTarget(winners[0])}
              className="rounded-adipa-control px-5 py-2.5 text-[14px] font-semibold text-white/90 underline-offset-4 transition hover:underline disabled:opacity-40"
            >
              {tw('alAgua')}
            </button>
          </>
        )}
      </div>

      {/* Con varios ganadores cada uno se valida o descalifica por separado (seccion 32). */}
      {!single && (
        <ul className="mt-5 space-y-2">
          {winners.map((winner) => (
            <li
              key={winner.id}
              className="flex items-center gap-3 rounded-adipa-card bg-white/10 px-4 py-2.5 ring-1 ring-white/20"
            >
              <span className="w-6 shrink-0 text-right text-[13px] font-bold tabular-nums text-white/60">
                {winner.position}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">
                {winner.name}
              </span>

              {validated[winner.id] !== undefined ? (
                <a
                  href={`/api/comprobante/${winner.id}`}
                  className="shrink-0 rounded-adipa-control bg-white px-3 py-1.5 text-[12px] font-bold text-brand-primary"
                >
                  {tw('downloadCertificate')}
                </a>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => validate(winner)}
                    className="shrink-0 rounded-adipa-control bg-white px-3 py-1.5 text-[12px] font-bold text-brand-primary disabled:opacity-60"
                  >
                    {tw('validate')}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setAlAguaTarget(winner)}
                    className="shrink-0 text-[12px] font-semibold text-white/80 underline-offset-4 hover:underline disabled:opacity-40"
                  >
                    {tw('alAgua')}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Salida hacia el resultado completo: Excel y trazabilidad (secciones 36 y 55). */}
      {drawId && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-[13px]">
          <a
            href={`/api/resultados/${drawId}`}
            className="font-semibold text-white underline-offset-4 hover:underline"
          >
            {tw('downloadResults')}
          </a>
          <span aria-hidden className="text-white/40">
            ·
          </span>
          <Link
            href={`/monitor/resultado/${drawId}`}
            className="font-semibold text-white/90 underline-offset-4 hover:underline"
          >
            Ver resultado completo
          </Link>
        </div>
      )}

      <ConfirmDialog
        open={alAguaTarget !== null}
        title={tc('alAguaTitle')}
        body={tc('alAguaBody')}
        confirmLabel={tc('alAguaAction')}
        tone="danger"
        onConfirm={confirmAlAgua}
        onCancel={() => {
          setAlAguaTarget(null);
          setReason('');
        }}
      >
        <div className="mt-4">
          <label htmlFor="al-agua-reason" className="block text-[13px] font-semibold text-fg-default">
            {tw('alAguaReason')}
          </label>
          <input
            id="al-agua-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ya no está en la reunión"
            className="mt-1.5 w-full rounded-adipa-control border border-border-subtle px-3.5 py-2 text-[14px] outline-none focus:border-brand-primary"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
