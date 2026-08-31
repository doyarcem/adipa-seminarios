/** Tipos del motor de elegibilidad. Sin dependencias de Prisma ni de red. */

export type ExclusionReason =
  | 'HOST'
  | 'CO_HOST'
  | 'ADIPA_NAME'
  | 'DUPLICATE_NAME'
  | 'INCOMPLETE_NAME'
  | 'DEVICE_NAME'
  | 'PREVIOUS_WINNER'
  | 'MANUAL'
  | 'OTHER';

export type DetectedRole = 'HOST' | 'CO_HOST' | 'STAFF' | 'UNKNOWN';

/** Participante crudo, tal como llega de Zoom o de un Excel. */
export interface RawParticipant {
  /** id/uuid de Zoom cuando existe. Zoom lo oculta para invitados (PII), asi que puede faltar. */
  externalId?: string | null;
  displayName: string;
  zoomUserId?: string | null;
  email?: string | null;
  device?: string | null;
  joinTime?: Date | null;
}

/**
 * Contexto de la reunion. Todo lo que el motor necesita saber que no viene en el
 * nombre del participante.
 */
export interface EligibilityContext {
  hostEmail?: string | null;
  hostName?: string | null;
  hostZoomUserId?: string | null;

  /** Emails de alternative hosts (se convierten en co-host al entrar). */
  alternativeHostEmails?: readonly string[];
  /** Co-hosts declarados por el administrador (mitigacion del limite de la API). */
  knownCoHostEmails?: readonly string[];
  /** Usuarios internos de la cuenta Zoom. Se marcan STAFF, NO se excluyen solos. */
  accountMemberEmails?: readonly string[];

  /**
   * IDs de usuario Zoom equivalentes a las listas de arriba.
   *
   * SON LOS QUE DE VERDAD FUNCIONAN con la Dashboard API: su respuesta de
   * participantes NO incluye `email`, solo `user_id`. Los emails sirven para la
   * fuente por webhooks, que si los entrega. Ver docs/00-ZOOM-RESEARCH.md.
   */
  alternativeHostZoomUserIds?: readonly string[];
  knownCoHostZoomUserIds?: readonly string[];
  accountMemberZoomUserIds?: readonly string[];

  /**
   * Nombres normalizados de ganadores anteriores de ESTA reunion (seccion 24).
   * Vacio al crear el snapshot; se completa al armar el pool de cada sorteo.
   */
  previousWinnerNames?: readonly string[];

  /** Decisiones manuales del operador, indexadas por id de participante (seccion 19). */
  manualOverrides?: Readonly<Record<string, boolean>>;
}

export interface EvaluatedParticipant {
  /** id estable dentro de la evaluacion (externalId si existe, si no un indice). */
  key: string;
  raw: RawParticipant;

  displayName: string;
  /** NFC + espacios colapsados. Case y tildes intactas (secciones 17 y 51). */
  normalizedName: string;
  personName: string | null;

  detectedRole: DetectedRole;

  /** Veredicto del motor automatico, sin intervencion manual. */
  autoEligible: boolean;
  autoExclusionReason: ExclusionReason | null;

  /** null = el operador no intervino. */
  manualOverride: boolean | null;

  /** Estado final. HOST/CO_HOST no se puede revertir manualmente (seccion 16). */
  eligible: boolean;
  exclusionReason: ExclusionReason | null;

  trace: string[];
}

export interface EligibilityResult {
  participants: EvaluatedParticipant[];
  totalFound: number;
  totalEligible: number;
  totalExcluded: number;
  /** Conteo por motivo, para la barra de resumen y los filtros (seccion 45). */
  byReason: Record<ExclusionReason, number>;
}
