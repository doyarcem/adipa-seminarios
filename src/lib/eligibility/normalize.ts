/**
 * Normalizaciones de nombre.
 *
 * Hay DOS normalizaciones distintas y no deben unificarse:
 *
 *  1. normalizeExact()  -> para detectar DUPLICADOS (seccion 17).
 *     Case-SENSIBLE y con tildes intactas, porque la seccion 51 exige que
 *     "Juan Perez" y "juan perez" puedan participar AMBOS.
 *
 *  2. foldForMatching() -> para la regla ADIPA (seccion 15) y el lexico de dispositivos.
 *     Case-INSENSIBLE y sin tildes.
 */

/** Espacios unicode que Zoom deja pasar en los nombres (NBSP, thin space, ZWSP, BOM...). */
const UNICODE_SPACES = /[\s   -​  　﻿]+/g;

/** Marcas diacriticas combinantes, para el plegado sin tildes. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Colapsa espacios (incluidos NBSP y tabs) y aplica NFC. No toca mayusculas ni tildes. */
export function normalizeExact(raw: string): string {
  return raw.normalize('NFC').replace(UNICODE_SPACES, ' ').trim();
}

/** Minusculas + sin diacriticos. Solo para comparaciones semanticas, nunca para duplicados. */
export function foldForMatching(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLocaleLowerCase('es')
    .normalize('NFC');
}

/**
 * Emojis, pictogramas, banderas, flechas y adornos tipograficos.
 * "(emoji) Juan Perez" -> "Juan Perez"  (seccion 13: debe seguir siendo elegible)
 */
const DECORATIONS =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{200D}\u{20E3}]/gu;

const TYPOGRAPHIC_NOISE = /[*~_=+#^`"«»“”]/g;

/** Quita emojis, pictogramas y adornos que rodean al nombre. */
export function stripDecorations(input: string): string {
  return input.replace(DECORATIONS, ' ').replace(TYPOGRAPHIC_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Tokeniza en palabras candidatas. Conserva apostrofes y guiones internos
 * ("O'Higgins", "Perez-Rojas") y separa el posesivo sajon ("Ramirez's" -> "Ramirez", "s").
 */
export function tokenize(input: string): string[] {
  return input
    .replace(/[’´`]/g, "'")
    .split(/[^\p{L}\p{N}'-]+/u)
    .map((t) => t.replace(/^[-']+|[-']+$/g, ''))
    .filter((t) => t.length > 0);
}

/** true si el token puede ser parte de un nombre de persona (letras, sin digitos). */
export function isAlphabeticToken(token: string): boolean {
  return /^[\p{L}][\p{L}'-]*$/u.test(token);
}
