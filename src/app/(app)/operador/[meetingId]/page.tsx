import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requirePageAccess } from '@/server/authz';
import { getStore, isSimulatorMode } from '@/server/context';
import { AppHeader } from '@/components/AppHeader';
import { SimulatorBanner } from '@/components/SimulatorBanner';
import { ExtractionPanel } from '@/components/operator/ExtractionPanel';
import { ParticipantsReview } from '@/components/operator/ParticipantsReview';
import { DrawConfig } from '@/components/operator/DrawConfig';
import { DrawHistory } from '@/components/operator/DrawHistory';

export const dynamic = 'force-dynamic';

export default async function OperatorConsolePage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const ctx = await requirePageAccess('meetings.select');
  const { meetingId } = await params;

  const store = getStore();
  const meeting = await store.getMeeting(meetingId);
  if (!meeting) notFound();

  const [active, snapshots, draws] = await Promise.all([
    store.getActiveSnapshot(meetingId),
    store.listSnapshots(meetingId),
    store.listDraws(meetingId),
  ]);

  const t = await getTranslations('participants');

  // Los ganadores previos ya no estan disponibles para el proximo sorteo (seccion 24).
  const previousWinners = new Set(await store.listPreviousWinnerNames(meetingId));
  const availableCount = active
    ? active.participants.filter((p) => p.eligible && !previousWinners.has(p.normalizedName)).length
    : 0;

  return (
    <>
      <AppHeader userName={ctx.name} userEmail={ctx.email} role={ctx.role} context={meeting.topic} />

      <main className="mx-auto max-w-350 px-4 py-8 sm:px-6 lg:px-8">
        {isSimulatorMode() && <SimulatorBanner />}

        <header className="mb-6">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="relative flex size-2">
              <span className="adipa-pulse-ring absolute inline-flex size-full rounded-full bg-state-success" />
              <span className="relative inline-flex size-2 rounded-full bg-state-success" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-state-success">
              En vivo
            </span>
            <span className="text-[13px] text-fg-subtle">·</span>
            <span className="text-[13px] text-fg-muted">{meeting.zoomAccountName}</span>
          </div>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg-default">{meeting.topic}</h1>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <ExtractionPanel
              meetingId={meetingId}
              snapshot={
                active
                  ? {
                      id: active.snapshot.id,
                      sequence: active.snapshot.sequence,
                      capturedAt: active.snapshot.capturedAt.toISOString(),
                      totalFound: active.snapshot.totalFound,
                      totalEligible: active.snapshot.totalEligible,
                      totalExcluded: active.snapshot.totalExcluded,
                    }
                  : null
              }
              snapshotCount={snapshots.length}
            />

            {active && (
              <ParticipantsReview
                meetingId={meetingId}
                participants={active.participants.map((p) => ({
                  id: p.id,
                  displayName: p.displayName,
                  personName: p.personName,
                  detectedRole: p.detectedRole,
                  eligible: p.eligible,
                  exclusionReason: p.exclusionReason,
                  autoExclusionReason: p.autoExclusionReason,
                  manualOverride: p.manualOverride,
                  device: p.device,
                }))}
                coHostWarning={t('coHostWarning')}
              />
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            <DrawConfig
              meetingId={meetingId}
              availableCount={availableCount}
              hasSnapshot={Boolean(active)}
              drawsRun={draws.length}
            />

            {draws.length > 0 && (
              <DrawHistory
                draws={draws.map((d) => ({
                  id: d.draw.id,
                  sequence: d.draw.sequence,
                  poolSize: d.draw.poolSize,
                  winners: d.winners.map((w) => ({
                    id: w.id,
                    name: w.winnerName,
                    position: w.position,
                    status: w.status,
                  })),
                }))}
              />
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
