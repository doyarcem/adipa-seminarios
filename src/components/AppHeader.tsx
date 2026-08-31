import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';
import { setLocale, setPreviewRole, signOutAction } from '@/server/actions/session';
import { isAuthBypassEnabled } from '@/lib/auth/bypass';
import type { Role } from '@/lib/auth/roles';

interface Props {
  userName: string | null;
  userEmail: string;
  role: Role;
  /** Migaja opcional a la derecha del nombre de la app. */
  context?: string | null;
}

export async function AppHeader({ userName, userEmail, role, context }: Props) {
  const t = await getTranslations('common');
  const locale = (await getLocale()) as Locale;
  const previewMode = isAuthBypassEnabled();

  return (
    <>
      {/* Aviso imposible de ignorar mientras el login esta desactivado. */}
      {previewMode && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-orange px-4 py-2 text-center text-[12px] font-semibold text-white">
          <span>
            Vista previa sin autenticación. El inicio de sesión está desactivado
            (<code className="font-mono font-normal">AUTH_BYPASS=true</code>).
          </span>
          <span aria-hidden className="opacity-60">
            ·
          </span>
          <span className="flex items-center gap-2">
            Ver como:
            {(['OPERATOR', 'ADMIN'] as const).map((option) => (
              <form key={option} action={setPreviewRole.bind(null, option)}>
                <button
                  type="submit"
                  aria-current={role === option}
                  className={`rounded-adipa-sm px-2 py-0.5 transition ${
                    role === option ? 'bg-white text-brand-orange' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  {option === 'ADMIN' ? t('admin') : t('operator')}
                </button>
              </form>
            ))}
          </span>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-border-subtle bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-350 items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href={role === 'ADMIN' ? '/admin' : '/operador'}
          className="text-[15px] font-bold tracking-tight text-brand-primary"
        >
          Adipa
        </Link>

        {context && (
          <>
            <span aria-hidden className="text-fg-subtle">
              /
            </span>
            <span className="truncate text-[14px] font-medium text-fg-muted">{context}</span>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-full bg-brand-surface-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-primary sm:inline">
            {role === 'ADMIN' ? t('admin') : t('operator')}
          </span>

          <div className="hidden text-right leading-tight sm:block">
            <p className="text-[13px] font-semibold text-fg-default">{userName ?? userEmail}</p>
            <p className="text-[11px] text-fg-subtle">{userEmail}</p>
          </div>

          {/* Selector de idioma. Un form por idioma evita depender de JS en el
              cliente para algo que el servidor puede resolver solo. */}
          <div className="flex items-center rounded-adipa-control border border-border-subtle p-0.5">
            {LOCALES.map((code) => (
              <form key={code} action={setLocale.bind(null, code)}>
                <button
                  type="submit"
                  aria-current={code === locale}
                  title={LOCALE_LABELS[code]}
                  className={`rounded-adipa-sm px-2 py-1 text-[11px] font-bold uppercase transition ${
                    code === locale
                      ? 'bg-brand-primary text-white'
                      : 'text-fg-subtle hover:text-fg-default'
                  }`}
                >
                  {code}
                </button>
              </form>
            ))}
          </div>

          {/* Sin login no hay sesion que cerrar. */}
          {!previewMode && (
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-adipa-control px-3 py-1.5 text-[13px] font-semibold text-fg-muted transition hover:bg-brand-surface-soft hover:text-fg-default"
              >
                {t('logout')}
              </button>
            </form>
          )}
        </div>
      </div>
      </header>
    </>
  );
}
