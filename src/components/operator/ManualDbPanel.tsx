'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { importManualDbAction, type ManualImportResult } from '@/server/actions/manualDb';
import { MAX_IMPORT_ROWS } from '@/lib/excel/import-limits';

/**
 * Ingreso de BDD manual (secciones 20 y 21).
 *
 * Va plegado por defecto: es un respaldo, no el camino normal. Se abre solo
 * cuando la extraccion desde Zoom falla, para que el operador lo tenga a mano
 * justo en el momento en que lo necesita.
 */
export function ManualDbPanel({
  meetingId,
  defaultOpen = false,
}: {
  meetingId: string;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('manualDb');
  const tp = useTranslations('participants');

  const [open, setOpen] = useState(defaultOpen);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ManualImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setResult(null);

    startTransition(async () => {
      setResult(await importManualDbAction(meetingId, formData));
    });
  };

  const errorMessage = (code: NonNullable<ManualImportResult['error']>): string => {
    switch (code) {
      case 'NO_NAME_COLUMN':
        return t('noNameColumn');
      case 'EMPTY_FILE':
        return t('emptyFile');
      case 'TOO_MANY_ROWS':
        return t('tooManyRows', { max: MAX_IMPORT_ROWS });
      case 'INVALID_FORMAT':
        return t('invalidFormat');
      case 'FILE_TOO_LARGE':
        return 'El archivo supera los 8 MB.';
      case 'NO_FILE':
        return 'Selecciona un archivo antes de cargar.';
      default:
        return 'No fue posible procesar el archivo.';
    }
  };

  return (
    <section className="adipa-card p-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-[17px] font-bold tracking-tight text-fg-default">{t('title')}</h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">{t('description')}</p>
        </div>
        <span aria-hidden className="shrink-0 text-[13px] font-semibold text-brand-primary">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4">
          <p className="rounded-adipa-card border border-brand-lavender bg-brand-surface-soft px-4 py-3 text-[12px] leading-relaxed text-fg-muted">
            {t('validationNotice')}
          </p>

          <div>
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept=".xlsx,.csv"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="block w-full text-[13px] text-fg-muted file:mr-3 file:rounded-adipa-control file:border-0 file:bg-brand-surface-soft file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-brand-primary hover:file:bg-brand-lavender"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">{t('columnHint')}</p>
          </div>

          <button
            type="submit"
            disabled={pending || !fileName}
            className="w-full rounded-adipa-control bg-brand-primary px-5 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {pending ? `${t('upload')}…` : t('upload')}
          </button>

          {result && !result.ok && result.error && (
            <p
              role="alert"
              className="rounded-adipa-card border border-state-error/40 bg-state-error/5 px-4 py-3 text-[13px] font-medium text-fg-default"
            >
              {errorMessage(result.error)}
            </p>
          )}

          {result?.ok && (
            <div className="rounded-adipa-card border border-state-success/40 bg-state-success/5 px-4 py-3">
              <p className="text-[13px] font-semibold text-fg-default">
                {tp('found')}: {result.totalFound} · {tp('eligible')}: {result.totalEligible} ·{' '}
                {tp('excluded')}: {result.totalExcluded}
              </p>
              <p className="mt-1 text-[12px] text-fg-muted">
                {result.nameColumnHeader
                  ? `Columna utilizada: "${result.nameColumnHeader}".`
                  : 'Se utilizó la primera columna del archivo.'}
                {result.skippedRows ? ` ${result.skippedRows} filas vacías omitidas.` : ''}
              </p>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
