/** Configuracion de idiomas (seccion 47). Agregar uno nuevo es sumarlo aqui y crear su JSON. */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

/** Cookie donde vive la eleccion del usuario. La lee el servidor al renderizar. */
export const LOCALE_COOKIE = 'adipa-locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};
