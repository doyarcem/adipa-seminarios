'use client';

import { useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useTranslations } from 'next-intl';

interface Props {
  hasZoom: boolean;
  hasGoogle: boolean;
  /** true mientras la autenticacion no es real: acepta cualquier credencial. */
  demoMode: boolean;
  callbackUrl: string;
}

/** Correo con el que entra el boton de Google mientras no hay credenciales reales. */
const DEMO_GOOGLE_EMAIL = 'monitor.demo@gmail.com';

export function LoginForm({ hasZoom, hasGoogle, demoMode, callbackUrl }: Props) {
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

  const signInWithGoogle = () => {
    // Con credenciales reales va a Google; sin ellas entra en modo prueba, para
    // que el boton no quede en un callejon sin salida durante la demostracion.
    if (hasGoogle) signIn('google', { callbackUrl });
    else enter({ email: email.trim() || DEMO_GOOGLE_EMAIL, password: 'demo' });
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

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-border-subtle" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
          {t('or')}
        </span>
        <span className="h-px flex-1 bg-border-subtle" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-adipa-control border border-border-subtle bg-white px-5 py-3 text-[15px] font-semibold text-fg-default transition hover:border-brand-primary/30 hover:shadow-sm disabled:opacity-60"
      >
        <GoogleMark />
        {t('signInWithGoogle')}
      </button>

      {hasZoom && (
        <button
          type="button"
          onClick={() => signIn('zoom', { callbackUrl })}
          disabled={pending}
          className="w-full rounded-adipa-control border border-border-subtle bg-white px-5 py-3 text-[15px] font-semibold text-fg-default transition hover:border-brand-primary/30 hover:shadow-sm disabled:opacity-60"
        >
          Iniciar sesión con Zoom
        </button>
      )}

      {demoMode && (
        <p className="rounded-adipa-card border border-brand-yellow/60 bg-brand-yellow/10 px-4 py-3 text-[12px] leading-relaxed text-fg-muted">
          <strong className="font-semibold text-fg-default">Modo demostración.</strong> La
          contraseña no se verifica: cualquier correo y contraseña permiten entrar. El rol se
          deriva del dominio del correo, igual que en producción — un correo{' '}
          <strong className="font-semibold text-fg-default">@adipa.cl</strong> entra como
          administrador y cualquier otro como monitor.
        </p>
      )}
    </div>
  );
}

/** Marca de Google, en su color oficial. Solo decorativa. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
