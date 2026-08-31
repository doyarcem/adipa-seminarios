import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { selectMeeting } from '@/server/actions/meetings';
import type { LiveMeetingCard } from '@/server/services/meetings';

/** Tarjeta de reunion activa (seccion 9). */
export async function MeetingCard({ meeting }: { meeting: LiveMeetingCard }) {
  const t = await getTranslations('meetings');
  const locale = await getLocale();

  const startTime = new Date(meeting.startTime).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className="adipa-card adipa-card-interactive flex flex-col p-5">
      <div className="mb-4 flex items-center gap-2">
        <span aria-hidden className="relative flex size-2">
          <span className="adipa-pulse-ring absolute inline-flex size-full rounded-full bg-state-success" />
          <span className="relative inline-flex size-2 rounded-full bg-state-success" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-state-success">
          {t('live')}
        </span>

        {meeting.hasActiveSnapshot && (
          <span className="ml-auto rounded-full bg-brand-surface-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand-primary">
            Snapshot activo
          </span>
        )}
      </div>

      <h2 className="mb-4 text-[17px] font-bold leading-snug tracking-tight text-fg-default">
        {meeting.topic}
      </h2>

      <dl className="mb-6 space-y-1.5 text-[13px]">
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-fg-subtle">{t('zoomAccount')}</dt>
          <dd className="truncate font-medium text-fg-muted">{meeting.zoomAccountName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-fg-subtle">{t('host')}</dt>
          <dd className="truncate font-medium text-fg-muted">{meeting.hostName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-fg-subtle">{t('startTime')}</dt>
          <dd className="font-medium tabular-nums text-fg-muted">{startTime}</dd>
        </div>
        {meeting.participantCount !== null && (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-fg-subtle">{t('participantCount')}</dt>
            <dd className="font-medium tabular-nums text-fg-muted">{meeting.participantCount}</dd>
          </div>
        )}
      </dl>

      <form action={selectMeeting} className="mt-auto">
        <input type="hidden" name="zoomAccountId" value={meeting.zoomAccountId} />
        <input type="hidden" name="zoomAccountName" value={meeting.zoomAccountName} />
        <input type="hidden" name="uuid" value={meeting.uuid} />
        <input type="hidden" name="meetingId" value={meeting.meetingId} />
        <input type="hidden" name="topic" value={meeting.topic} />
        <input type="hidden" name="hostName" value={meeting.hostName} />
        <input type="hidden" name="startTime" value={meeting.startTime} />

        <button
          type="submit"
          className="adipa-gradient w-full rounded-adipa-control px-4 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-90"
        >
          {t('select')}
        </button>
      </form>
    </article>
  );
}
