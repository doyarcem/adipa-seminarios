import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requirePageRole } from '@/server/authz';
import { getStore, isSimulatorMode, listZoomAccounts } from '@/server/context';
import { AppHeader } from '@/components/AppHeader';
import { SimulatorBanner } from '@/components/SimulatorBanner';

export const dynamic = 'force-dynamic';

/**
 * Vista de administrador.
 *
 * ESTADO: version minima. Muestra la actividad real registrada y las cuentas
 * disponibles, para que el inicio de sesion de un administrador no termine en un
 * 404. Las secciones completas -vinculacion de cuentas Zoom, administracion de
 * usuarios, historial global y auditoria detallada (secciones 7, 37 y 38)- estan
 * pendientes.
 */
export default async function AdminPage() {
  const ctx = await requirePageRole('ADMIN');
  const t = await getTranslations('admin');

  const store = getStore();
  const audit = await store.listAudit({ limit: 25 });
  const accounts = listZoomAccounts();

  const drawsRun = audit.filter((e) => e.action === 'DRAW_STARTED').length;
  const winners = audit.filter((e) => e.action === 'WINNER_SELECTED').length;

  return (
    <>
      <AppHeader userName={ctx.name} userEmail={ctx.email} role={ctx.role} />

      <main className="mx-auto max-w-350 px-4 py-10 sm:px-6 lg:px-8">
        {isSimulatorMode() && <SimulatorBanner />}

        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-fg-default">{t('dashboard')}</h1>
        </header>

        <div className="mb-6 rounded-adipa-card border border-brand-lavender bg-brand-surface-soft px-5 py-4">
          <p className="text-[13px] leading-relaxed text-fg-muted">
            <strong className="font-semibold text-fg-default">Vista en construcción.</strong> La
            vinculación de cuentas Zoom, la administración de usuarios, el historial global y la
            auditoría detallada están pendientes. Mientras tanto puedes operar desde{' '}
            <Link href="/operador" className="font-semibold text-brand-primary hover:underline">
              la vista de operador
            </Link>
            .
          </p>
        </div>

        <dl className="mb-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('connectedAccounts')} value={accounts.length} />
          <Stat label={t('drawsRun')} value={drawsRun} />
          <Stat label={t('winners')} value={winners} />
          <Stat label="Eventos registrados" value={audit.length} />
        </dl>

        <section className="adipa-card p-6">
          <h2 className="mb-4 text-[17px] font-bold tracking-tight text-fg-default">
            {t('recentActivity')}
          </h2>

          {audit.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-fg-subtle">{t('audit.empty')}</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {audit.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                  <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                    {event.createdAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[13px] font-semibold text-fg-default">{event.action}</span>
                  <span className="text-[12px] text-fg-subtle">{event.actorEmail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="adipa-card p-5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-1 text-[32px] font-bold tabular-nums text-brand-primary">{value}</dd>
    </div>
  );
}
