'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface DrawSummary {
  id: string;
  sequence: number;
  poolSize: number;
  winners: { id: string; name: string; position: number; status: string }[];
}

/** Sorteos ya realizados en esta reunion (seccion 24). */
export function DrawHistory({ draws }: { draws: DrawSummary[] }) {
  const t = useTranslations('draw');
  const tw = useTranslations('winner');

  return (
    <section className="adipa-card p-6">
      <h2 className="text-[17px] font-bold tracking-tight text-fg-default">Sorteos realizados</h2>

      <ol className="mt-4 space-y-4">
        {[...draws].reverse().map((draw) => (
          <li key={draw.id} className="border-l-2 border-brand-lavender pl-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-bold text-brand-primary">
                {t('drawNumber', { number: draw.sequence })}
              </p>
              <p className="text-[11px] tabular-nums text-fg-subtle">
                {t('poolSize', { count: draw.poolSize })}
              </p>
            </div>

            <ul className="mt-1.5 space-y-1">
              {draw.winners.map((winner) => (
                <li key={winner.id} className="flex items-center gap-2 text-[13px]">
                  <span className="tabular-nums text-fg-subtle">{winner.position}.</span>
                  <span
                    className={
                      winner.status === 'AL_AGUA'
                        ? 'text-fg-subtle line-through'
                        : 'font-medium text-fg-default'
                    }
                  >
                    {winner.name}
                  </span>
                  {winner.status === 'VALIDATED' && (
                    <span className="rounded-full bg-state-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-state-success">
                      {tw('validated')}
                    </span>
                  )}
                  {winner.status === 'AL_AGUA' && (
                    <span className="rounded-full bg-brand-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
                      {tw('alAgua')}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <Link
              href={`/operador/resultado/${draw.id}`}
              className="mt-2 inline-block text-[12px] font-semibold text-brand-primary hover:underline"
            >
              Ver resultado →
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
