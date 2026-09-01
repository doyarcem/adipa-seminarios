import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { requirePageAccess } from '@/server/authz';
import { getStore } from '@/server/context';
import { AppHeader } from '@/components/AppHeader';
import { ResultActions } from '@/components/operator/ResultActions';

export const dynamic = 'force-dynamic';

/** Resultado de un sorteo ya cerrado, con las descargas (secciones 33, 34 y 36). */
export default async function DrawResultPage({
  params,
}: {
  params: Promise<{ drawId: string }>;
}) {
  const ctx = await requirePageAccess('results.export');
  const { drawId } = await params;

  const store = getStore();
  const draw = await store.getDraw(drawId);
  if (!draw) notFound();

  const [meeting, snapshot] = await Promise.all([
    store.getMeeting(draw.draw.meetingId),
    store.getSnapshot(draw.draw.snapshotId),
  ]);
  if (!meeting) notFound();

  const [t, tw, tr] = await Promise.all([
    getTranslations('draw'),
    getTranslations('winner'),
    getTranslations('results'),
  ]);
  const locale = await getLocale();

  const active = draw.winners.filter((w) => w.status !== 'AL_AGUA');
  const disqualified = draw.winners.filter((w) => w.status === 'AL_AGUA');

  const fmt = (date: Date) =>
    `${date.toLocaleDateString(locale)} · ${date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;

  return (
    <>
      <AppHeader userName={ctx.name} userEmail={ctx.email} role={ctx.role} context={meeting.topic} />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href={`/monitor/${meeting.id}`}
          className="text-[13px] font-semibold text-brand-primary hover:underline"
        >
          ← {meeting.topic}
        </Link>

        <header className="mb-8 mt-3">
          <h1 className="text-3xl font-bold tracking-tight text-fg-default">
            {t('drawNumber', { number: draw.draw.sequence })}
          </h1>
          <p className="mt-1 text-[14px] text-fg-muted">
            {fmt(draw.draw.startedAt)}
            {draw.draw.operatorName && ` · ${draw.draw.operatorName}`}
          </p>
        </header>

        <section className="adipa-card mb-6 p-6">
          <h2 className="mb-4 text-[17px] font-bold tracking-tight text-fg-default">
            {active.length === 1 ? tw('single') : tw('plural')}
          </h2>

          <ol className="space-y-3">
            {active.map((winner) => (
              <li
                key={winner.id}
                className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3 last:border-0 last:pb-0"
              >
                <span className="w-6 text-right text-[15px] font-bold tabular-nums text-fg-subtle">
                  {winner.position}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold text-fg-default">
                    {winner.winnerName}
                  </p>
                  {winner.status === 'VALIDATED' && winner.validatedAt && (
                    <p className="mt-0.5 text-[12px] text-fg-subtle">
                      {tw('validatedBy', {
                        name: winner.validatedByName ?? '—',
                        date: winner.validatedAt.toLocaleDateString(locale),
                        time: winner.validatedAt.toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      })}
                    </p>
                  )}
                </div>

                {winner.status === 'VALIDATED' ? (
                  <a
                    href={`/api/comprobante/${winner.id}`}
                    className="shrink-0 rounded-adipa-control bg-brand-primary px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
                  >
                    {tw('downloadCertificate')}
                  </a>
                ) : (
                  <span
                    title={tw('validateHint')}
                    className="shrink-0 rounded-adipa-control border border-border-subtle px-4 py-2 text-[13px] font-semibold text-fg-subtle"
                  >
                    Pendiente de validación
                  </span>
                )}
              </li>
            ))}
          </ol>

          {disqualified.length > 0 && (
            <div className="mt-5 border-t border-border-subtle pt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
                {tr('alAgua')}
              </p>
              <ul className="space-y-1">
                {disqualified.map((winner) => (
                  <li key={winner.id} className="text-[13px] text-fg-subtle">
                    <span className="line-through">{winner.winnerName}</span>
                    {winner.alAguaReason && ` — ${winner.alAguaReason}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <ResultActions drawId={drawId} label={tw('downloadResults')} />

        {/* Datos de auditoria: permiten reconstruir el sorteo despues (seccion 55). */}
        <section className="adipa-card mt-6 p-6">
          <h2 className="mb-4 text-[15px] font-bold tracking-tight text-fg-default">
            Trazabilidad del sorteo
          </h2>

          <dl className="space-y-2.5 text-[13px]">
            <Row label={tr('meeting')} value={meeting.topic} />
            <Row label="Cuenta Zoom" value={meeting.zoomAccountName} />
            <Row label="Snapshot utilizado" value={`#${snapshot?.snapshot.sequence ?? '—'}`} />
            <Row
              label="Snapshot extraído"
              value={snapshot ? fmt(snapshot.snapshot.capturedAt) : '—'}
            />
            <Row label="Participantes encontrados" value={String(snapshot?.snapshot.totalFound ?? '—')} />
            <Row label="Universo del sorteo" value={String(draw.draw.poolSize)} />
            <Row label="Ganadores solicitados" value={String(draw.draw.requestedWinners)} />
            <Row label="Cuenta regresiva" value={`${draw.draw.countdownSeconds} s`} />
            <Row label="Huella del universo" value={draw.draw.poolHash} mono />
          </dl>
        </section>
      </main>
    </>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      <dt className="w-52 shrink-0 text-fg-subtle">{label}</dt>
      <dd
        className={`min-w-0 flex-1 break-words font-medium text-fg-muted ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
