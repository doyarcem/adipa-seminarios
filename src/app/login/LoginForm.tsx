'use client';

import { useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';

interface Props {
  hasZoom: boolean;
  hasGoogle: boolean;
  devMode: boolean;
  callbackUrl: string;
}

export function LoginForm({ hasZoom, hasGoogle, devMode, callbackUrl }: Props) {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitDev = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await signIn('dev', { email, name, redirect: false });
      if (result?.error) setError(t('invalidCredentials'));
      else window.location.href = callbackUrl;
    });
  };

  return (
    <div className="space-y-5">
      {hasZoom && (
        <button
          type="button"
          onClick={() => signIn('zoom', { callbackUrl })}
          className="adipa-gradient w-full rounded-adipa-control px-5 py-3 text-[15px] font-semibold text-white transition hover:opacity-90"
        >
          Iniciar sesión con Zoom
        </button>
      )}

      {hasGoogle && (
        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl })}
          className="w-full rounded-adipa-control border border-border-subtle bg-white px-5 py-3 text-[15px] font-semibold text-fg-default transition hover:border-brand-primary/30 hover:shadow-sm"
        >
          {t('signInWithGoogle')}
        </button>
      )}

      {devMode && (
        <form onSubmit={submitDev} className="space-y-4">
          {(hasZoom || hasGoogle) && (
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border-subtle" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                Modo prueba
              </span>
              <span className="h-px flex-1 bg-border-subtle" />
            </div>
          )}

          <div className="rounded-adipa-card border border-brand-yellow/50 bg-brand-yellow/10 px-4 py-3 text-[13px] leading-relaxed text-fg-muted">
            Acceso temporal mientras se configuran las credenciales de Zoom. El rol se
            asigna igual que en producción, según el dominio del correo:{' '}
            <strong className="font-semibold text-fg-default">@adipa.cl</strong> entra como
            administrador, cualquier otro dominio como operador.
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[13px] font-semibold text-fg-default">
              {t('email')}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sala1.virtualys@gmail.com"
              className="w-full rounded-adipa-control border border-border-subtle bg-white px-4 py-2.5 text-[15px] outline-none transition focus:border-brand-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-[13px] font-semibold text-fg-default">
              Nombre
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Operador Sala 1"
              className="w-full rounded-adipa-control border border-border-subtle bg-white px-4 py-2.5 text-[15px] outline-none transition focus:border-brand-primary"
            />
          </div>

          {error && (
            <p role="alert" className="text-[13px] font-medium text-state-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="adipa-gradient w-full rounded-adipa-control px-5 py-3 text-[15px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t('signIn') + '…' : t('signIn')}
          </button>
        </form>
      )}

      {!hasZoom && !hasGoogle && !devMode && (
        <div className="rounded-adipa-card border border-state-error/40 bg-state-error/5 px-4 py-3 text-[13px] leading-relaxed text-fg-muted">
          No hay ningún método de acceso configurado. Define las credenciales de Zoom o
          Google, o habilita <code className="font-mono text-[12px]">AUTH_DEV_MODE=true</code>{' '}
          para el modo prueba.
        </div>
      )}
    </div>
  );
}
