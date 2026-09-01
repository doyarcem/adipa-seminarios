import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isDevAuthEnabled } from '@/auth';
import { getOptionalSession } from '@/server/authz';
import { LoginForm } from './LoginForm';
import { AdipaLogo } from '@/components/AdipaLogo';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await getOptionalSession();
  if (session) redirect(session.role === 'ADMIN' ? '/admin' : '/monitor');

  const t = await getTranslations('auth');
  const { from } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Panel de marca. Sin logo: DESIGN.md 4.2 prohibe reconstruirlo, y todavia
          no se entregaron los archivos oficiales. Se apoya en color y tipografia. */}
      <section className="adipa-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-white/10"
        />

        <AdipaLogo mode="white" height={34} className="relative" />

        <div className="relative max-w-md space-y-4">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Sorteos en vivo</h1>
          <p className="text-base leading-relaxed text-white/80">
            Extrae a quienes están conectados, revisa la lista y realiza el sorteo mientras
            compartes pantalla, con respaldo auditable de cada paso.
          </p>
        </div>

        <p className="relative text-[13px] text-white/70">
          Academia Digital de Psicología y Aprendizaje
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8">
          <header className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-fg-default">{t('signInTitle')}</h2>
            <p className="text-[15px] leading-relaxed text-fg-muted">{t('signInSubtitle')}</p>
          </header>

          <LoginForm
            hasZoom={Boolean(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET)}
            hasGoogle={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
            demoMode={isDevAuthEnabled()}
            callbackUrl={from ?? '/'}
          />
        </div>
      </section>
    </main>
  );
}
