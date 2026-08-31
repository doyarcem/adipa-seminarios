/**
 * Contrato de persistencia.
 *
 * Todo el resto de la aplicacion habla con esta interfaz, nunca con Prisma ni con
 * el Map en memoria. Hoy corre la implementacion en memoria; conectar Postgres
 * despues es escribir `PrismaStore implements DrawStore` y cambiar una linea en
 * la fabrica, sin tocar servicios ni pantallas.
 *
 * Los nombres y la forma de los registros siguen deliberadamente el esquema de
 * `prisma/schema.prisma`, para que la migracion sea mecanica.
 */

import type { DetectedRole, EvaluatedParticipant, ExclusionReason } from '@/lib/eligibility/types';

export type ParticipantSource = 'ZOOM_DASHBOARD' | 'ZOOM_WEBHOOK_ROSTER' | 'EXCEL';
export type DrawStatus = 'RUNNING' | 'COMPLETED' | 'CANCELLED';
export type WinnerStatus = 'PENDING' | 'VALIDATED' | 'AL_AGUA';

export interface StoredMeeting {
  id: string;
  zoomAccountId: string;
  zoomAccountName: string;
  zoomMeetingUuid: string;
  zoomMeetingId: string;
  topic: string;
  hostName: string | null;
  hostEmail: string | null;
  startTime: Date | null;
  createdAt: Date;
}

export interface StoredParticipant {
  id: string;
  snapshotId: string;
  displayName: string;
  normalizedName: string;
  personName: string | null;
  zoomParticipantId: string | null;
  zoomUserId: string | null;
  email: string | null;
  device: string | null;
  joinTime: Date | null;
  detectedRole: DetectedRole;
  autoEligible: boolean;
  autoExclusionReason: ExclusionReason | null;
  manualOverride: boolean | null;
  eligible: boolean;
  exclusionReason: ExclusionReason | null;
  evaluationTrace: string[];
}

export interface StoredSnapshot {
  id: string;
  meetingId: string;
  sequence: number;
  source: ParticipantSource;
  capturedAt: Date;
  totalFound: number;
  totalEligible: number;
  totalExcluded: number;
  sourceFileName: string | null;
  isActive: boolean;
  capturedById: string | null;
}

export interface StoredWinner {
  id: string;
  drawId: string;
  participantId: string;
  winnerName: string;
  position: number;
  status: WinnerStatus;
  replacedByWinnerId: string | null;
  alAguaReason: string | null;
  alAguaAt: Date | null;
  validatedAt: Date | null;
  validatedById: string | null;
  validatedByName: string | null;
  certificateFileName: string | null;
  createdAt: Date;
}

export interface StoredDraw {
  id: string;
  meetingId: string;
  snapshotId: string;
  sequence: number;
  requestedWinners: number;
  actualWinners: number;
  countdownSeconds: number;
  poolSize: number;
  poolHash: string;
  status: DrawStatus;
  startedAt: Date;
  completedAt: Date | null;
  operatorId: string | null;
  operatorName: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  meetingId: string | null;
  snapshotId: string | null;
  drawId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: Date;
}

export interface Actor {
  userId: string;
  email: string;
  name: string | null;
}

export interface CreateSnapshotInput {
  meeting: Omit<StoredMeeting, 'id' | 'createdAt'>;
  source: ParticipantSource;
  sourceFileName?: string | null;
  evaluated: readonly EvaluatedParticipant[];
  actor: Actor;
}

export interface SnapshotWithParticipants {
  snapshot: StoredSnapshot;
  participants: StoredParticipant[];
}

export interface CreateDrawInput {
  meetingId: string;
  snapshotId: string;
  requestedWinners: number;
  countdownSeconds: number;
  poolSize: number;
  poolHash: string;
  actor: Actor;
}

export interface DrawWithWinners {
  draw: StoredDraw;
  winners: StoredWinner[];
}

/**
 * Repositorio del dominio.
 *
 * Nota sobre inmutabilidad: no existe `updateSnapshot` ni `deleteParticipant`.
 * Un snapshot solo se crea y se lee (seccion 11 y seccion 55). Lo unico mutable de
 * un participante es la decision manual del operador, y esa queda registrada
 * aparte en la auditoria.
 */
export interface DrawStore {
  // ── reuniones ──
  upsertMeeting(meeting: Omit<StoredMeeting, 'id' | 'createdAt'>): Promise<StoredMeeting>;
  getMeeting(meetingId: string): Promise<StoredMeeting | null>;
  findMeetingByUuid(zoomAccountId: string, uuid: string): Promise<StoredMeeting | null>;

  // ── snapshots ──
  createSnapshot(input: CreateSnapshotInput): Promise<SnapshotWithParticipants>;
  getSnapshot(snapshotId: string): Promise<SnapshotWithParticipants | null>;
  getActiveSnapshot(meetingId: string): Promise<SnapshotWithParticipants | null>;
  listSnapshots(meetingId: string): Promise<StoredSnapshot[]>;

  /** Unica mutacion permitida sobre un participante (seccion 19). */
  setManualOverride(
    participantId: string,
    override: boolean | null,
    actor: Actor,
  ): Promise<StoredParticipant>;

  // ── sorteos ──
  createDraw(input: CreateDrawInput): Promise<StoredDraw>;
  completeDraw(drawId: string, winners: { participantId: string; winnerName: string }[]): Promise<DrawWithWinners>;
  getDraw(drawId: string): Promise<DrawWithWinners | null>;
  listDraws(meetingId: string): Promise<DrawWithWinners[]>;

  /** Nombres normalizados de todos los ganadores previos de la reunion (seccion 24). */
  listPreviousWinnerNames(meetingId: string): Promise<string[]>;
  /** Ids de participante ya premiados o descalificados dentro de un sorteo (seccion 12). */
  listBlockedParticipantIds(drawId: string): Promise<string[]>;

  getWinner(winnerId: string): Promise<StoredWinner | null>;
  markAlAgua(winnerId: string, reason: string | null, actor: Actor): Promise<StoredWinner>;
  addReplacementWinner(
    drawId: string,
    replacedWinnerId: string,
    participantId: string,
    winnerName: string,
  ): Promise<StoredWinner>;
  validateWinner(winnerId: string, actor: Actor): Promise<StoredWinner>;
  attachCertificate(winnerId: string, fileName: string): Promise<StoredWinner>;

  // ── auditoria ──
  audit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void>;
  listAudit(filter?: { meetingId?: string; limit?: number }): Promise<AuditEntry[]>;
}
