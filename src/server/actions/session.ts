'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { signOut } from '@/auth';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/i18n/config';

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
