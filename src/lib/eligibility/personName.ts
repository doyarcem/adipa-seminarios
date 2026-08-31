/**
 * Deteccion inteligente de nombres (secciones 13 y 14 del spec).
 *
 * La regla de negocio es: para participar, el nombre debe contener al menos
 * UN NOMBRE y UN APELLIDO identificables.
 *
 * El spec PROHIBE explicitamente una blacklist que excluya cualquier nombre que
 * contenga "Android" o "iPhone". Por eso el algoritmo *desenvuelve* el nombre en
 * lugar de rechazarlo:
 *
 *   "Android"                  -> 0 tokens de persona -> DEVICE
 *   "Android de Daniel Oyarce" -> quita "Android de"  -> "Daniel Oyarce" -> PERSON
 *   "Juan's iPhone"            -> quita "iPhone"      -> "Juan"          -> DEVICE (1 token)
 *   "Juan Ramirez's iPhone"    -> quita "iPhone"      -> "Juan Ramirez"  -> PERSON
 *
 * Todo el proceso es determinista y deja una traza explicable (seccion 18).
 */

import { DEVICE_TERMS, NAME_PARTICLES, CONTEXT_SEPARATORS } from './lexicon';
import { foldForMatching, isAlphabeticToken, normalizeExact, stripDecorations, tokenize } from './normalize';

export type NameVerdictKind = 'PERSON' | 'DEVICE' | 'INCOMPLETE';

export interface NameVerdict {
  kind: NameVerdictKind;
  /** Nombre de persona extraido, solo cuando kind === 'PERSON'. */
  personName: string | null;
  /** Tokens que el motor considero nombre de persona. */
  nameTokens: string[];
  /** Pasos aplicados, en orden. Se muestran al operador para explicar la decision. */
  trace: string[];
}

interface Token {
  /** Texto original, con mayusculas y tildes. */
  raw: string;
  /** Plegado para comparar contra los lexicos. */
  folded: string;
  /** true si venia con posesivo sajon ("Ramirez's"). */
  possessive: boolean;
}

const POSSESSIVE = /['’´`]s$/iu;
const HAS_DIGIT = /\p{N}/u;
const PARENTHETICAL = /[([{][^)\]}]*[)\]}]/gu;

function toTokens(input: string): Token[] {
  return tokenize(input).map((raw) => {
    const possessive = POSSESSIVE.test(raw);
    const stripped = possessive ? raw.replace(POSSESSIVE, '') : raw;
    return { raw: stripped, folded: foldForMatching(stripped), possessive };
  });
}

const isDevice = (t: Token) => DEVICE_TERMS.has(t.folded);
const isParticle = (t: Token) => NAME_PARTICLES.has(t.folded);
const isJoiner = (t: Token) => t.folded === 'de' || t.folded === 'del' || t.folded === 'of';

/**
 * Un token cuenta como nombre de persona si es alfabetico, tiene al menos 2 letras,
 * no es un termino de dispositivo y no es una particula/conector.
 */
function isPersonToken(t: Token): boolean {
  if (t.raw.length < 2) return false;
  if (HAS_DIGIT.test(t.raw)) return false;
  if (!isAlphabeticToken(t.raw)) return false;
  if (isDevice(t)) return false;
  if (isParticle(t)) return false;
  return true;
}

interface Reduction {
  tokens: Token[];
  deviceSeen: boolean;
  trace: string[];
}

/** Quita los envoltorios de dispositivo alrededor del nombre. */
function unwrapDevice(input: Token[]): Reduction {
  let tokens = [...input];
  const trace: string[] = [];
  let deviceSeen = false;

  // A) Prefijo "<Dispositivo> de <Persona>"  ->  "Android de Daniel Oyarce"
  let lead = 0;
  while (lead < tokens.length && isDevice(tokens[lead])) lead++;
  if (lead > 0 && lead < tokens.length && isJoiner(tokens[lead])) {
    const removed = tokens.slice(0, lead + 1).map((t) => t.raw).join(' ');
    tokens = tokens.slice(lead + 1);
    deviceSeen = true;
    trace.push(`unwrap.devicePrefix:${removed}`);
  }

  // B) Sufijo posesivo "<Persona>'s <Dispositivo>"  ->  "Juan Ramirez's iPhone"
  let tail = tokens.length;
  while (tail > 0 && isDevice(tokens[tail - 1])) tail--;
  if (tail < tokens.length) {
    const removed = tokens.slice(tail).map((t) => t.raw).join(' ');
    const possessiveBefore = tail > 0 && tokens[tail - 1].possessive;
    tokens = tokens.slice(0, tail);
    deviceSeen = true;
    trace.push(possessiveBefore ? `unwrap.possessiveDevice:${removed}` : `unwrap.deviceSuffix:${removed}`);
  }

  // C) Dispositivos sueltos en cualquier otra posicion
  const remaining = tokens.filter((t) => !isDevice(t));
  if (remaining.length !== tokens.length) {
    const removed = tokens.filter(isDevice).map((t) => t.raw).join(', ');
    tokens = remaining;
    deviceSeen = true;
    trace.push(`unwrap.deviceToken:${removed}`);
  }

  return { tokens, deviceSeen, trace };
}

function removeParenthetical(input: string): string {
  return input.replace(PARENTHETICAL, ' ').replace(/\s+/g, ' ').trim();
}

function cutAtSeparator(input: string): string | null {
  for (const sep of CONTEXT_SEPARATORS) {
    const idx = input.indexOf(sep);
    if (idx > 0) return input.slice(0, idx).trim();
  }
  return null;
}

interface Attempt {
  label: string;
  text: string;
}

/** Candidatos en orden de preferencia: del recorte mas agresivo al texto completo. */
function buildAttempts(clean: string): Attempt[] {
  const attempts: Attempt[] = [];
  const noParens = removeParenthetical(clean);
  const cut = cutAtSeparator(noParens);

  if (cut && cut !== noParens) attempts.push({ label: 'cut.contextSeparator', text: cut });
  if (noParens !== clean) attempts.push({ label: 'cut.parenthetical', text: noParens });
  attempts.push({ label: 'full', text: clean });

  return attempts;
}

/**
 * Analiza un nombre de participante y decide si identifica a una persona.
 * Funcion pura: mismo input -> mismo output. Sin I/O, sin fecha, sin azar.
 */
export function analyzeName(displayName: string): NameVerdict {
  const exact = normalizeExact(displayName);
  const clean = stripDecorations(exact);
  const trace: string[] = [];

  if (clean !== exact) trace.push('strip.decorations');
  if (clean.length === 0) {
    return { kind: 'INCOMPLETE', personName: null, nameTokens: [], trace: [...trace, 'empty'] };
  }

  let anyDeviceSeen = false;
  let fallback: NameVerdict | null = null;

  for (const attempt of buildAttempts(clean)) {
    const attemptTrace = [...trace];
    if (attempt.label !== 'full') attemptTrace.push(attempt.label);

    const reduction = unwrapDevice(toTokens(attempt.text));
    attemptTrace.push(...reduction.trace);
    anyDeviceSeen = anyDeviceSeen || reduction.deviceSeen;

    const personTokens = reduction.tokens.filter(isPersonToken);
    attemptTrace.push(`nameTokens:${personTokens.length}`);

    if (personTokens.length >= 2) {
      // Se reconstruye conservando particulas internas ("Juan de la Cruz").
      const first = reduction.tokens.indexOf(personTokens[0]);
      const last = reduction.tokens.indexOf(personTokens[personTokens.length - 1]);
      const personName = reduction.tokens
        .slice(first, last + 1)
        .map((t) => t.raw)
        .join(' ');

      return {
        kind: 'PERSON',
        personName,
        nameTokens: personTokens.map((t) => t.raw),
        trace: attemptTrace,
      };
    }

    // Se guarda el resultado del intento sobre el texto completo como fallback.
    if (attempt.label === 'full') {
      fallback = {
        kind: anyDeviceSeen ? 'DEVICE' : 'INCOMPLETE',
        personName: null,
        nameTokens: personTokens.map((t) => t.raw),
        trace: attemptTrace,
      };
    }
  }

  return (
    fallback ?? { kind: 'INCOMPLETE', personName: null, nameTokens: [], trace: [...trace, 'nameTokens:0'] }
  );
}
