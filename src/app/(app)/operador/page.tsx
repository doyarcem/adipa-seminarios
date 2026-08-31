import { getTranslations } from 'next-intl/server';
import { requirePageAccess } from '@/server/authz';
import { listActiveMeetings } from '@/server/services/meetings';
import { isSimulatorMode } from '@/server/context';
import { AppHeader } from '@/components/AppHeader';
import { MeetingCard } from '@/components/MeetingCard';
import { SimulatorBanner } from '@/components/SimulatorBanner';
import { ZoomErrorNotice } from '@/components/ZoomErrorNotice';

// Las reuniones activas cambian minuto a minuto: nunca se cachean.
export const dynamic = 'force-dynamic';

export default async function OperatorMeetingsPage() {
  const ctx = await requirePageAccess('meetings.select');
  const t = await getTranslations('meetings');

  const { meetings, failedAccounts } = await listActiveMeetings();

  return (
    <>
      <AppHeader userName={ctx.name} userEmail={ctx.email} role={ctx.role} />

      <main className="mx-auto max-w-350 px-4 py-10 sm:px-6 lg:px-8">
        {isSimulatorMode() && <SimulatorBanner />}

        <header className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-fg-default">{t('title')}</h1>
          <p className="text-[15px] leading-relaxed text-fg-muted">{t('subtitle')}</p>
        </header>

        {failedAccounts.length > 0 && (
          <div className="mb-6 space-y-3">
            {failedAccounts.map((account) => (
              <ZoomErrorNotice
                key={account.accountName}
                code={account.code}
                accountName={account.accountName}
              />
            ))}
          </div>
        )}

        {meetings.length === 0 ? (
          <div className="adipa-card px-8 py-14 text-center">
            <p className="text-[15px] font-semibold text-fg-default">{t('empty')}</p>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-fg-muted">
              {t('emptyHint')}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {meetings.map((meeting) => (
              <MeetingCard key={`${meeting.zoomAccountId}:${meeting.uuid}`} meeting={meeting} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
