'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { resetMeetingAction } from '@/server/actions/meetings';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Props {
  zoomAccountId: string;
  meetingUuid: string;
  /** Nombre del seminario, para que la confirmacion diga cual se va a limpiar. */
  topic: string;
}

/**
 * "Limpiar datos" de una reunion.
 *
 * Deliberadamente pide confirmacion: borra los sorteos ya realizados y eso no
 * tiene vuelta atras. El nombre del seminario aparece en el dialogo porque en la
 * lista hay varias tarjetas iguales y equivocarse de una seria facil.
 */
export function ResetMeetingButton({ zoomAccountId, meetingUuid, topic }: Props) {
  const t = useTranslations('meetings');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setConfirming(false);
    setError(null);

    startTransition(async () => {
      const result = await resetMeetingAction(zoomAccountId, meetingUuid);
      if (!result.ok) setError(t('resetFailed'));
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirming(true)}
        className="mt-2 w-full rounded-adipa-control border border-border-subtle px-4 py-2.5 text-[14px] font-semibold text-fg-muted transition hover:border-state-error hover:text-state-error disabled:opacity-50"
      >
        {pending ? t('resetting') : t('reset')}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-state-error">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title={t('resetConfirmTitle')}
        body={t('resetConfirmBody', { topic })}
        confirmLabel={t('reset')}
        tone="danger"
        onConfirm={reset}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
