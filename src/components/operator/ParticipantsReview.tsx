'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { setParticipantOverride } from '@/server/actions/meetings';

export interface ReviewParticipant {
  id: string;
  displayName: string;
  personName: string | null;
  detectedRole: string;
  eligible: boolean;
  exclusionReason: string | null;
  autoExclusionReason: string | null;
  manualOverride: boolean | null;
  device: string | null;
}

interface Props {
  meetingId: string;
  participants: ReviewParticipant[];
  coHostWarning: string;
}

type FilterId =
  | 'all'
  | 'eligible'
  | 'excluded'
  | 'host'
  | 'coHost'
  | 'duplicate'
  | 'incomplete'
  | 'device'
  | 'adipa'
  | 'manual';

const FILTERS: { id: FilterId; match: (p: ReviewParticipant) => boolean }[] = [
  { id: 'all', match: () => true },
  { id: 'eligible', match: (p) => p.eligible },
  { id: 'excluded', match: (p) => !p.eligible },
  { id: 'host', match: (p) => p.detectedRole === 'HOST' },
  { id: 'coHost', match: (p) => p.detectedRole === 'CO_HOST' },
  { id: 'duplicate', match: (p) => p.exclusionReason === 'DUPLICATE_NAME' },
  { id: 'incomplete', match: (p) => p.exclusionReason === 'INCOMPLETE_NAME' },
  { id: 'device', match: (p) => p.exclusionReason === 'DEVICE_NAME' },
  { id: 'adipa', match: (p) => p.exclusionReason === 'ADIPA_NAME' },
  { id: 'manual', match: (p) => p.manualOverride !== null },
];

/** Se pagina en el cliente: con 1.000 filas, renderizarlas todas congela la pestana. */
const PAGE_SIZE = 40;

export function ParticipantsReview({ meetingId, participants, coHostWarning }: Props) {
  const t = useTranslations('participants');
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = {} as Record<FilterId, number>;
    for (const f of FILTERS) map[f.id] = participants.filter(f.match).length;
    return map;
  }, [participants]);

  const filtered = useMemo(() => {
    const matcher = FILTERS.find((f) => f.id === filter)!.match;
    const needle = query.trim().toLocaleLowerCase();

    return participants.filter(
      (p) => matcher(p) && (!needle || p.displayName.toLocaleLowerCase().includes(needle)),
    );
  }, [participants, filter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggle = (participant: ReviewParticipant) => {
    setNotice(null);
    startTransition(async () => {
      const next = !participant.eligible;
      const result = await setParticipantOverride(meetingId, participant.id, next);
      if (!result.ok && result.message === 'ROLE_LOCKED') setNotice(t('roleLocked'));
    });
  };

  const hasUnknownRoles = participants.some((p) => p.detectedRole === 'UNKNOWN');

  return (
    <section className="adipa-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold tracking-tight text-fg-default">{t('reviewTitle')}</h2>

        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="w-full max-w-xs rounded-adipa-control border border-border-subtle px-3.5 py-2 text-[14px] outline-none transition focus:border-brand-primary"
        />
      </div>

      {/* Aviso permanente del limite real de la API de Zoom (seccion 16). */}
      {hasUnknownRoles && (
        <p className="mb-4 rounded-adipa-card border border-brand-yellow/60 bg-brand-yellow/10 px-4 py-2.5 text-[12px] leading-relaxed text-fg-muted">
          {coHostWarning}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.filter((f) => counts[f.id] > 0 || f.id === 'all').map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFilter(f.id);
              setPage(0);
            }}
            aria-pressed={filter === f.id}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              filter === f.id
                ? 'bg-brand-primary text-white'
                : 'bg-brand-surface-soft text-fg-muted hover:text-fg-default'
            }`}
          >
            {t(`filters.${f.id}`)}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {notice && (
        <p role="alert" className="mb-3 text-[13px] font-medium text-state-error">
          {notice}
        </p>
      )}

      <ul className="divide-y divide-border-subtle border-y border-border-subtle">
        {visible.map((p) => (
          <li key={p.id} className="flex items-center gap-4 py-2.5">
            <span
              aria-hidden
              className={`size-2 shrink-0 rounded-full ${
                p.eligible ? 'bg-state-success' : 'bg-border-strong'
              }`}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-fg-default">{p.displayName}</p>

              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg-subtle">
                {p.eligible ? (
                  <span className="font-semibold text-state-success">{t('included')}</span>
                ) : (
                  <span>{t(`reasons.${p.exclusionReason ?? 'OTHER'}`)}</span>
                )}

                {/* El nombre extraido explica por que "Android de X" sí participa. */}
                {p.personName && p.personName !== p.displayName && (
                  <span className="text-fg-subtle">· {p.personName}</span>
                )}

                {p.detectedRole !== 'UNKNOWN' && (
                  <span className="rounded-full bg-brand-surface-soft px-2 py-0.5 font-semibold text-brand-primary">
                    {t(`roles.${p.detectedRole}`)}
                  </span>
                )}

                {p.manualOverride !== null && (
                  <span className="rounded-full bg-brand-lavender px-2 py-0.5 font-semibold text-brand-primary">
                    {t('manualBadge')}
                  </span>
                )}
              </p>
            </div>

            <button
              type="button"
              disabled={pending || p.detectedRole === 'HOST' || p.detectedRole === 'CO_HOST'}
              onClick={() => toggle(p)}
              title={
                p.detectedRole === 'HOST' || p.detectedRole === 'CO_HOST' ? t('roleLocked') : undefined
              }
              className="shrink-0 rounded-adipa-control border border-border-subtle px-3 py-1.5 text-[12px] font-semibold text-fg-muted transition hover:border-brand-primary/40 hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {p.eligible ? t('exclude') : t('include')}
            </button>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-[14px] text-fg-subtle">Sin resultados.</p>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[12px] tabular-nums text-fg-subtle">
            {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de{' '}
            {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-adipa-control border border-border-subtle px-3 py-1.5 text-[12px] font-semibold text-fg-muted disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-adipa-control border border-border-subtle px-3 py-1.5 text-[12px] font-semibold text-fg-muted disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
