'use client';

import { useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';

interface Props {
  hasZoom: boolean;
  /** true mientras la autenticacion no es real: acepta cualquier credencial. */
  demoMode: boolean;
  callbackUrl: string;
}

export function LoginForm({ hasZoom, demoMode, callbackUrl }: Props) {
  const t = useTranslations('auth');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const enter = (credentials: { email: string; password: string }) => {
    setError(null);
    startTransition(async () => {
      const result = await signIn('dev', { ...credentials, redirect: false });
      if (result?.error) setError(t('invalidCredentials'));
      else window.location.href = callbackUrl;
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    enter({ email, password });
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-[13px] font-semibold text-fg-default">
            {t('email')}
          </label>
          <input
            id="email"
            name="email"
            /* En demostracion el campo es de texto libre: con type="email" el
               propio navegador bloquea el envio si lo escrito no tiene forma de
               correo, y entonces no basta con "poner cualquier dato". */
            type={demoMode ? 'text' : 'email'}
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@correo.com"
            className="w-full rounded-adipa-control border border-border-subtle bg-white px-4 py-2.5 text-[15px] outline-none transition focus:border-brand-primary"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-[13px] font-semibold text-fg-default">
            {t('password')}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
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
          {pending ? `${t('signIn')}…` : t('signIn')}
        </button>
      </form>

      {/* Login de operadores con su cuenta Zoom. Solo aparece cuando hay credenciales
          OAuth de Zoom configuradas. El ingreso por Google se retiro de la interfaz. */}
      {hasZoom && (
        <>
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-border-subtle" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              {t('or')}
            </span>
            <span className="h-px flex-1 bg-border-subtle" />
          </div>

          <button
            type="button"
            onClick={() => signIn('zoom', { callbackUrl })}
            disabled={pending}
            className="w-full rounded-adipa-control border border-border-subtle bg-white px-5 py-3 text-[15px] font-semibold text-fg-default transition hover:border-brand-primary/30 hover:shadow-sm disabled:opacity-60"
          >
            Iniciar sesión con Zoom
          </button>
        </>
      )}

      {demoMode && (
        <p className="rounded-adipa-card border border-brand-yellow/60 bg-brand-yellow/10 px-4 py-3 text-[12px] leading-relaxed text-fg-muted">
          <strong className="font-semibold text-fg-default">Modo demostración.</strong> Ingresa con
          una de las cuentas de prueba configuradas por el administrador. El rol se deriva del
          dominio del correo, igual que en producción — un correo{' '}
          <strong className="font-semibold text-fg-default">@adipa.cl</strong> entra como
          administrador y cualquier otro como monitor.
        </p>
      )}
    </div>
  );
}
