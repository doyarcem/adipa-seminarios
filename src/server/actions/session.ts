'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { signOut } from '@/auth';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/i18n/config';
import { PREVIEW_ROLE_COOKIE, isAuthBypassEnabled, isRole } from '@/lib/auth/bypass';

/** Cambia el idioma de la interfaz (seccion 47). */
export async function setLocale(next: string): Promise<void> {
  const locale = isLocale(next) ? next : DEFAULT_LOCALE;
  const store = await cookies();

  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  revalidatePath('/', 'layout');
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}

/**
 * Cambia el rol durante la vista previa sin autenticacion.
 *
 * Solo funciona si el modo esta activo. Si no lo esta, no hace nada: nadie puede
 * cambiarse el rol a si mismo llamando a esta accion (seccion 40).
 */
export async function setPreviewRole(next: string): Promise<void> {
  if (!isAuthBypassEnabled()) return;

  const role = isRole(next) ? next : 'OPERATOR';
  const store = await cookies();

  store.set(PREVIEW_ROLE_COOKIE, role, { path: '/', maxAge: 60 * 60 * 24, sameSite: 'lax' });
  revalidatePath('/', 'layout');
}
