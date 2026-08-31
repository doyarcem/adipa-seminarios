import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './config';

/**
 * Resuelve el idioma en cada request desde la cookie.
 *
 * Se eligio cookie en vez de prefijo de ruta (/es, /en) a proposito: el operador
 * comparte pantalla y navega con la URL a la vista; un prefijo de idioma solo
 * agrega ruido y rompe los enlaces guardados al cambiar de idioma.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
