'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  COUNTDOWN_PRESETS,
  DEFAULT_COUNTDOWN_SECONDS,
  DEFAULT_WINNERS,
  MAX_COUNTDOWN_SECONDS,
  MAX_WINNERS_PER_DRAW,
} from '@/lib/draw/constants';

interface Props {
  meetingId: string;
  availableCount: number;
  hasSnapshot: boolean;
  drawsRun: number;
}

/** Configuracion del sorteo (secciones 23, 24 y 26). */
export function DrawConfig({ meetingId, availableCount, hasSnapshot, drawsRun }: Props) {
  const t = useTranslations('draw');
  const router = useRouter();

  const [winners, setWinners] = useState(DEFAULT_WINNERS);
  const [countdown, setCountdown] = useState<number>(DEFAULT_COUNTDOWN_SECONDS);
  const [customMode, setCustomMode] = useState(false);

  // Seccion 23: pedir mas ganadores que disponibles no es un error, se avisa y se ajusta.
  const willSelect = Math.min(winners, availableCount);
  const capped = hasSnapshot && availableCount > 0 && willSelect < winners;
  const canRun = hasSnapshot && availableCount > 0;

  const start = () => {
    const params = new URLSearchParams({
      winners: String(winners),
      countdown: String(countdown),
    });
    router.push(`/operador/${meetingId}/sorteo?${params}`);
  };

  return (
    <section className="adipa-card p-6">
      <h2 className="text-[17px] font-bold tracking-tight text-fg-default">{t('configTitle')}</h2>

      {drawsRun > 0 && (
        <p className="mt-1 text-[12px] text-fg-subtle">
          {t('drawNumber', { number: drawsRun + 1 })} · {t('poolSize', { count: availableCount })}
        </p>
      )}

      <div className="mt-5 space-y-5">
        <div>
          <label
            htmlFor="winners"
            className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-fg-subtle"
          >
            {t('winners')}
          </label>
          <select
            id="winners"
            value={winners}
            onChange={(e) => setWinners(Number(e.target.value))}
            className="mt-1.5 w-full rounded-adipa-control border border-border-subtle bg-white px-3.5 py-2.5 text-[15px] font-medium outline-none transition focus:border-brand-primary"
          >
            {Array.from({ length: MAX_WINNERS_PER_DRAW }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="countdown"
            className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-fg-subtle"
          >
            {t('countdown')}
          </label>

          {customMode ? (
            <div className="mt-1.5 flex gap-2">
              <input
                id="countdown"
                type="number"
                min={1}
                max={MAX_COUNTDOWN_SECONDS}
                value={countdown}
                onChange={(e) => setCountdown(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-adipa-control border border-border-subtle px-3.5 py-2.5 text-[15px] font-medium tabular-nums outline-none transition focus:border-brand-primary"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomMode(false);
                  setCountdown(DEFAULT_COUNTDOWN_SECONDS);
                }}
                className="shrink-0 rounded-adipa-control border border-border-subtle px-3 text-[13px] font-semibold text-fg-muted"
              >
                ↺
              </button>
            </div>
          ) : (
            <select
              id="countdown"
              value={countdown}
              onChange={(e) => {
                if (e.target.value === 'custom') setCustomMode(true);
                else setCountdown(Number(e.target.value));
              }}
              className="mt-1.5 w-full rounded-adipa-control border border-border-subtle bg-white px-3.5 py-2.5 text-[15px] font-medium outline-none transition focus:border-brand-primary"
            >
              {COUNTDOWN_PRESETS.map((n) => (
                <option key={n} value={n}>
                  {n} {t('seconds')}
                </option>
              ))}
              <option value="custom">{t('customTime')}</option>
            </select>
          )}
        </div>
      </div>

      {capped && (
        <p className="mt-4 rounded-adipa-card border border-brand-yellow/60 bg-brand-yellow/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-fg-muted">
          {t('fewerThanRequested', { actual: willSelect, requested: winners })}
        </p>
      )}

      <button
        type="button"
        onClick={start}
        disabled={!canRun}
        className="adipa-gradient mt-6 w-full rounded-adipa-control px-5 py-3.5 text-[15px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {drawsRun > 0 ? t('runNext') : t('run')}
      </button>

      {!canRun && (
        <p className="mt-3 text-center text-[12px] leading-relaxed text-fg-subtle">
          {hasSnapshot ? t('notEnoughParticipants') : 'Primero extrae los participantes.'}
        </p>
      )}
    </section>
  );
}
