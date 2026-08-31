'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** Rojo para acciones destructivas como "Al agua". */
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

/**
 * Confirmacion para acciones con consecuencias (seccion 50).
 *
 * Usa <dialog> nativo para obtener foco atrapado, cierre con Escape y capa
 * superior sin gestionar z-index a mano.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'default',
  onConfirm,
  onCancel,
  children,
}: Props) {
  const t = useTranslations('common');
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // Clic fuera del panel cierra, como cualquier modal.
        if (e.target === ref.current) onCancel();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-adipa-card border border-border-subtle bg-white p-0 backdrop:bg-brand-navy/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <h2 className="text-[17px] font-bold leading-snug tracking-tight text-fg-default">{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">{body}</p>

        {children}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-adipa-control border border-border-subtle px-4 py-2 text-[14px] font-semibold text-fg-muted transition hover:bg-brand-surface-soft"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`rounded-adipa-control px-4 py-2 text-[14px] font-semibold text-white transition hover:opacity-90 ${
              tone === 'danger' ? 'bg-state-error' : 'adipa-gradient'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
