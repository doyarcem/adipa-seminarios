/**
 * Motor de elegibilidad. Funcion pura, determinista y sin I/O.
 *
 * Aplica las reglas en ORDEN DE PRIORIDAD. La primera que aplica define el motivo
 * de exclusion que se muestra al operador (seccion 18):
 *
 *   1. HOST / CO_HOST      -> inanulable, ni siquiera por decision manual (seccion 16)
 *   2. ADIPA               -> el nombre contiene "adipa" (seccion 15)
 *   3. MANUAL              -> el operador lo excluyo a mano (seccion 19)
 *   4. PREVIOUS_WINNER     -> ya gano en esta reunion (seccion 24)
 *   5. DUPLICATE_NAME      -> nombre textualmente identico a otro (seccion 17)
 *   6. DEVICE / INCOMPLETE -> el nombre no identifica a una persona (secciones 13-14)
 *
 * Una inclusion manual sobrescribe 4, 5 y 6. NUNCA sobrescribe 1.
 */

import { foldForMatching, normalizeExact } from './normalize';
import { analyzeName } from './personName';
import type {
  DetectedRole,
  EligibilityContext,
  EligibilityResult,
  EvaluatedParticipant,
  ExclusionReason,
  RawParticipant,
} from './types';

const EMPTY_REASON_COUNTS = (): Record<ExclusionReason, number> => ({
  HOST: 0,
  CO_HOST: 0,
  ADIPA_NAME: 0,
  DUPLICATE_NAME: 0,
  INCOMPLETE_NAME: 0,
  DEVICE_NAME: 0,
  PREVIOUS_WINNER: 0,
  MANUAL: 0,
  OTHER: 0,
});

const emailKey = (v?: string | null) => (v ? foldForMatching(v.trim()) : null);

function toEmailSet(values?: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const v of values ?? []) {
    const k = emailKey(v);
    if (k) set.add(k);
  }
  return set;
}

interface IdentitySets {
  altEmails: Set<string>;
  knownEmails: Set<string>;
  memberEmails: Set<string>;
  altIds: Set<string>;
  knownIds: Set<string>;
  memberIds: Set<string>;
}

/**
 * Detecta el rol del participante con la evidencia disponible.
 *
 * Se cruza por DOS identificadores porque cada fuente entrega uno distinto:
 *   - Dashboard API  -> solo `user_id` (su respuesta no trae email)
 *   - Webhooks       -> `email` cuando la persona entro logueada
 *
 * LIMITACION CONOCIDA: la API de Zoom no expone el rol en-reunion de un participante
 * (ver docs/00-ZOOM-RESEARCH.md seccion 2). Un co-host promovido durante la reunion
 * que no este en alternative_hosts ni en la lista del admin se devuelve como UNKNOWN.
 * La UI advierte de esto al operador; no se simula una certeza que no existe.
 */
function detectRole(
  p: RawParticipant,
  ctx: EligibilityContext,
  sets: IdentitySets,
  trace: string[],
): DetectedRole {
  const email = emailKey(p.email);
  const userId = p.zoomUserId?.trim() || null;
  const hostEmail = emailKey(ctx.hostEmail);
  const hostUserId = ctx.hostZoomUserId?.trim() || null;

  if (email && hostEmail && email === hostEmail) {
    trace.push('role.host:email');
    return 'HOST';
  }
  if (userId && hostUserId && userId === hostUserId) {
    trace.push('role.host:zoomUserId');
    return 'HOST';
  }
  // Coincidencia por nombre: evidencia mas debil, solo se usa si no hay email en juego.
  if (
    !email &&
    ctx.hostName &&
    foldForMatching(normalizeExact(p.displayName)) === foldForMatching(normalizeExact(ctx.hostName))
  ) {
    trace.push('role.host:displayName');
    return 'HOST';
  }

  if ((email && sets.altEmails.has(email)) || (userId && sets.altIds.has(userId))) {
    trace.push('role.coHost:alternativeHost');
    return 'CO_HOST';
  }
  if ((email && sets.knownEmails.has(email)) || (userId && sets.knownIds.has(userId))) {
    trace.push('role.coHost:knownList');
    return 'CO_HOST';
  }
  if ((email && sets.memberEmails.has(email)) || (userId && sets.memberIds.has(userId))) {
    // Miembro interno de la cuenta Zoom. Se MARCA pero no se excluye por si solo:
    // el spec no lo pide y podria excluir asistentes legitimos. La UI lo destaca.
    trace.push('role.staff:accountMember');
    return 'STAFF';
  }

  return 'UNKNOWN';
}

/** true si el nombre contiene "adipa" (case-insensible y sin depender de tildes) (seccion 15). */
export function containsAdipa(displayName: string): boolean {
  return foldForMatching(normalizeExact(displayName)).includes('adipa');
}

export function evaluateParticipants(
  raws: readonly RawParticipant[],
  ctx: EligibilityContext = {},
): EligibilityResult {
  const toIdSet = (values?: readonly string[]) =>
    new Set((values ?? []).map((v) => v.trim()).filter((v) => v.length > 0));

  const sets: IdentitySets = {
    altEmails: toEmailSet(ctx.alternativeHostEmails),
    knownEmails: toEmailSet(ctx.knownCoHostEmails),
    memberEmails: toEmailSet(ctx.accountMemberEmails),
    altIds: toIdSet(ctx.alternativeHostZoomUserIds),
    knownIds: toIdSet(ctx.knownCoHostZoomUserIds),
    memberIds: toIdSet(ctx.accountMemberZoomUserIds),
  };

  const previousWinners = new Set((ctx.previousWinnerNames ?? []).map(normalizeExact));
  const overrides = ctx.manualOverrides ?? {};

  // Paso 1: normalizar y contar nombres identicos.
  // La comparacion es EXACTA: "Juan Perez" y "juan perez" NO son duplicados (seccion 51).
  const prepared = raws.map((raw, index) => {
    const normalizedName = normalizeExact(raw.displayName);
    return {
      key: raw.externalId?.trim() || `idx:${index}`,
      raw,
      normalizedName,
      verdict: analyzeName(raw.displayName),
    };
  });

  const nameCounts = new Map<string, number>();
  for (const p of prepared) {
    nameCounts.set(p.normalizedName, (nameCounts.get(p.normalizedName) ?? 0) + 1);
  }

  // Paso 2: aplicar reglas por prioridad.
  const participants: EvaluatedParticipant[] = prepared.map((p) => {
    const trace: string[] = [...p.verdict.trace];
    const role = detectRole(p.raw, ctx, sets, trace);

    let autoReason: ExclusionReason | null = null;

    if (role === 'HOST') {
      autoReason = 'HOST';
    } else if (role === 'CO_HOST') {
      autoReason = 'CO_HOST';
    } else if (containsAdipa(p.raw.displayName)) {
      autoReason = 'ADIPA_NAME';
      trace.push('rule.adipa');
    } else if (previousWinners.has(p.normalizedName)) {
      autoReason = 'PREVIOUS_WINNER';
      trace.push('rule.previousWinner');
    } else if ((nameCounts.get(p.normalizedName) ?? 0) > 1) {
      autoReason = 'DUPLICATE_NAME';
      trace.push(`rule.duplicate:${nameCounts.get(p.normalizedName)}`);
    } else if (p.verdict.kind === 'DEVICE') {
      autoReason = 'DEVICE_NAME';
      trace.push('rule.deviceName');
    } else if (p.verdict.kind === 'INCOMPLETE') {
      autoReason = 'INCOMPLETE_NAME';
      trace.push('rule.incompleteName');
    }

    const autoEligible = autoReason === null;

    // Paso 3: intervencion manual. HOST y CO_HOST son inanulables (seccion 16).
    const roleLocked = role === 'HOST' || role === 'CO_HOST';
    const rawOverride = Object.prototype.hasOwnProperty.call(overrides, p.key) ? overrides[p.key] : null;
    const manualOverride = roleLocked ? null : rawOverride;

    if (rawOverride !== null && roleLocked) trace.push('override.rejected:roleLocked');
    else if (manualOverride === true) trace.push('override.include');
    else if (manualOverride === false) trace.push('override.exclude');

    const eligible = manualOverride ?? autoEligible;
    const exclusionReason: ExclusionReason | null = eligible
      ? null
      : manualOverride === false
        ? 'MANUAL'
        : autoReason;

    return {
      key: p.key,
      raw: p.raw,
      displayName: p.raw.displayName,
      normalizedName: p.normalizedName,
      personName: p.verdict.personName,
      detectedRole: role,
      autoEligible,
      autoExclusionReason: autoReason,
      manualOverride,
      eligible,
      exclusionReason,
      trace,
    };
  });

  const byReason = EMPTY_REASON_COUNTS();
  let totalEligible = 0;
  for (const p of participants) {
    if (p.eligible) totalEligible++;
    else if (p.exclusionReason) byReason[p.exclusionReason]++;
  }

  return {
    participants,
    totalFound: participants.length,
    totalEligible,
    totalExcluded: participants.length - totalEligible,
    byReason,
  };
}
