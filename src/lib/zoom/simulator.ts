/**
 * Simulador de Zoom.
 *
 * Implementa el MISMO contrato que el cliente real (ZoomProvider), de modo que
 * toda la aplicacion funcione de punta a punta sin credenciales del Marketplace:
 * reuniones simultaneas, hasta 1.000 participantes, roles, y los errores del
 * seccion 41 para poder ensayar el respaldo por BDD manual.
 *
 * Propiedades importantes:
 *  - DETERMINISTA por semilla: la misma reunion produce siempre la misma sala,
 *    asi una demo se puede repetir y un bug se puede reproducir.
 *  - El roster DERIVA con el tiempo (gente entra y sale), para que "Actualizar
 *    participantes" genere de verdad un snapshot distinto y se pueda demostrar
 *    la seccion 11.
 *  - Por defecto reproduce exactamente los numeros del spec: 486 encontrados,
 *    421 seleccionados, 65 excluidos.
 */

import { ZoomApiError, type ZoomErrorCode } from './errors';
import type {
  ZoomAccountUser,
  ZoomLiveMeeting,
  ZoomLiveParticipant,
  ZoomMeetingSettings,
} from './client';
import type { ZoomProvider } from './provider';
import {
  ADIPA_STAFF_NAMES,
  DEVICE_ONLY_NAMES,
  DEVICE_WRAPPERS,
  FIRST_NAMES,
  HOST_NAMES,
  LAST_NAMES,
  ROOM_ACCOUNTS,
  SEMINAR_TOPICS,
} from './simulator-data';

// ─────────────────────────── aleatoriedad reproducible ───────────────────────────

/** Hash de cadena a entero de 32 bits. Convierte un uuid en semilla estable. */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: PRNG pequeno y determinista. NO se usa para sortear, solo para simular. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length)];

// ─────────────────────────── configuracion ───────────────────────────

export interface SimulatorConfig {
  /** Cuantas reuniones estan en vivo. El spec exige soportar hasta 5 simultaneas. */
  liveMeetings: number;
  /** Total de participantes por reunion. El spec fija 1.000 como tope esperado. */
  participantsPerMeeting: number;
  /** Semilla global. Cambiarla genera un universo distinto y reproducible. */
  seed: number;
  /** Error a inyectar en la proxima consulta de participantes (seccion 41). */
  fault: ZoomErrorCode | null;
  /** Latencia simulada, para ver los estados de carga de la seccion 42. */
  latencyMs: number;
  /** Congela el roster: util en tests, donde la deriva por tiempo estorba. */
  freezeRoster: boolean;
}

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  liveMeetings: 3,
  participantsPerMeeting: 486,
  seed: 20260831,
  fault: null,
  latencyMs: 350,
  freezeRoster: false,
};

/**
 * Reparto de la sala calculado para dar exactamente los numeros del spec cuando
 * hay 486 participantes: 421 seleccionados y 65 excluidos.
 *
 *   excluidos = 20 dispositivos + 27 nombres incompletos + 7 Adipa
 *             + 1 host + 2 co-hosts + 8 duplicados = 65
 *   elegibles = 391 nombres completos + 30 nombres con dispositivo = 421
 */
interface RosterMix {
  deviceOnly: number;
  singleName: number;
  adipaStaff: number;
  coHosts: number;
  duplicatePairs: number;
  deviceWrapped: number;
}

function mixFor(total: number): RosterMix {
  // Proporciones tomadas del caso de referencia de 486 y escaladas.
  const scale = total / 486;
  const round = (n: number) => Math.max(0, Math.round(n * scale));

  return {
    deviceOnly: Math.min(round(20), DEVICE_ONLY_NAMES.length),
    singleName: round(27),
    adipaStaff: Math.min(round(7), ADIPA_STAFF_NAMES.length),
    coHosts: total >= 50 ? 2 : 0,
    duplicatePairs: round(4),
    deviceWrapped: round(30),
  };
}

// ─────────────────────────── generacion del roster ───────────────────────────

interface SimParticipant {
  key: string;
  userName: string;
  email: string | null;
  zoomUserId: string | null;
  device: string;
  /** Orden estable de llegada, para simular quien lleva mas rato conectado. */
  arrivalOrder: number;
}

const DEVICES = ['Windows', 'Mac', 'iOS', 'Android', 'Linux'];

function makeUniqueFullName(random: () => number, used: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // Agotadas las combinaciones simples, se agrega un segundo apellido.
  let name: string;
  do {
    name = `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)} ${pick(random, LAST_NAMES)}`;
  } while (used.has(name));
  used.add(name);
  return name;
}

/**
 * Construye la sala completa de una reunion. El resultado depende solo del uuid
 * y de la configuracion, nunca del reloj: la deriva temporal se aplica despues.
 */
function buildBaseRoster(
  meetingUuid: string,
  hostName: string,
  hostEmail: string,
  total: number,
  config: SimulatorConfig,
): SimParticipant[] {
  const random = makeRandom(hashSeed(meetingUuid) ^ config.seed);
  const used = new Set<string>();
  const roster: SimParticipant[] = [];
  const mix = mixFor(total);

  const push = (userName: string, extra: Partial<SimParticipant> = {}) => {
    roster.push({
      key: `${meetingUuid}:${roster.length}`,
      userName,
      email: null,
      zoomUserId: null,
      device: pick(random, DEVICES),
      arrivalOrder: roster.length,
      ...extra,
    });
  };

  // 1. El anfitrion. Se excluye por identidad, no por su nombre.
  push(hostName, { email: hostEmail, zoomUserId: `host-${hashSeed(meetingUuid) % 100000}` });

  // 2. Co-anfitriones declarados como alternative hosts.
  //    Son usuarios REALES del directorio de la cuenta: solo asi el email de
  //    `alternative_hosts` se puede resolver a un `user_id` comparable con el
  //    roster. Ver src/lib/zoom/roleContext.ts.
  for (let i = 0; i < mix.coHosts; i++) {
    const accountIndex = ROOM_ACCOUNTS.length - 1 - i;
    push(makeUniqueFullName(random, used), {
      email: `${ROOM_ACCOUNTS[accountIndex]}.adipa@simulador.local`,
      zoomUserId: `sim-user-${accountIndex}`,
    });
  }

  // 3. Equipo Adipa: se excluye por la regla del nombre (seccion 15).
  for (let i = 0; i < mix.adipaStaff; i++) {
    push(ADIPA_STAFF_NAMES[i % ADIPA_STAFF_NAMES.length]);
  }

  // 4. Dispositivos sin persona identificable (seccion 13).
  for (let i = 0; i < mix.deviceOnly; i++) {
    push(DEVICE_ONLY_NAMES[i % DEVICE_ONLY_NAMES.length]);
  }

  // 5. Solo nombre de pila. Unicos entre si, para que el motivo sea
  //    "nombre incompleto" y no "duplicado".
  const usedSingles = new Set<string>();
  for (let i = 0; i < mix.singleName; i++) {
    let name: string;
    do {
      name = pick(random, FIRST_NAMES);
    } while (usedSingles.has(name));
    usedSingles.add(name);
    used.add(name);
    push(name);
  }

  // 6. Homonimos exactos: dos personas escriben identico (seccion 17).
  for (let i = 0; i < mix.duplicatePairs; i++) {
    const name = makeUniqueFullName(random, used);
    push(name);
    push(name);
  }

  // 7. Nombre completo dentro de un envoltorio de dispositivo: SI participan (seccion 14).
  for (let i = 0; i < mix.deviceWrapped; i++) {
    const wrapper = pick(random, DEVICE_WRAPPERS);
    push(wrapper(makeUniqueFullName(random, used)));
  }

  // 8. El resto: nombre y apellido, sin complicaciones.
  while (roster.length < total) {
    push(makeUniqueFullName(random, used));
  }

  return roster.slice(0, total);
}

/**
 * Deriva del roster con el paso del tiempo: en una sala real la gente entra y sale.
 *
 * El "bucket" avanza cada 30 segundos, asi que pulsar "Actualizar participantes"
 * un minuto despues devuelve de verdad una sala distinta y se puede demostrar que
 * el snapshot es una foto y no un vivo (seccion 11 y seccion 12).
 */
function applyDrift(base: SimParticipant[], meetingUuid: string, config: SimulatorConfig): SimParticipant[] {
  if (config.freezeRoster) return base;

  const bucket = Math.floor(Date.now() / 30_000);
  const random = makeRandom(hashSeed(`${meetingUuid}:${bucket}`));

  // Se van algunos, nunca el anfitrion (indice 0).
  const leaving = new Set<number>();
  const leaveCount = Math.min(Math.floor(base.length * 0.015), base.length - 1);
  for (let i = 0; i < leaveCount; i++) {
    leaving.add(1 + Math.floor(random() * (base.length - 1)));
  }

  const remaining = base.filter((_, index) => !leaving.has(index));

  // Y llegan rezagados con nombre completo.
  const used = new Set(remaining.map((p) => p.userName));
  const joinCount = Math.floor(random() * 6);
  const joiners: SimParticipant[] = [];
  for (let i = 0; i < joinCount; i++) {
    joiners.push({
      key: `${meetingUuid}:tarde:${bucket}:${i}`,
      userName: makeUniqueFullName(random, used),
      email: null,
      zoomUserId: null,
      device: pick(random, DEVICES),
      arrivalOrder: base.length + i,
    });
  }

  return [...remaining, ...joiners];
}

// ─────────────────────────── reuniones ───────────────────────────

const SIM_ACCOUNT_ID = 'SIM-ADIPA-BUSINESS';

function buildMeetings(config: SimulatorConfig): ZoomLiveMeeting[] {
  const random = makeRandom(config.seed);
  const count = Math.max(0, Math.min(config.liveMeetings, ROOM_ACCOUNTS.length));
  const meetings: ZoomLiveMeeting[] = [];

  for (let i = 0; i < count; i++) {
    const room = ROOM_ACCOUNTS[i];
    const seminar = SEMINAR_TOPICS[i % SEMINAR_TOPICS.length];
    const host = HOST_NAMES[i % HOST_NAMES.length];
    const numericId = 8000000000 + i * 1111;

    // Empezaron entre 10 y 70 minutos atras.
    const startedMinutesAgo = 10 + Math.floor(random() * 60);

    meetings.push({
      uuid: `sim-${room}-${numericId}==`,
      id: numericId,
      topic: seminar.topic,
      host,
      email: `${room}.adipa@simulador.local`,
      user_type: 'Licensed',
      start_time: new Date(Date.now() - startedMinutesAgo * 60_000).toISOString(),
      duration: String(startedMinutesAgo),
      participants: config.participantsPerMeeting,
    });
  }

  return meetings;
}

// ─────────────────────────── el simulador ───────────────────────────

export class ZoomSimulator implements ZoomProvider {
  private readonly config: SimulatorConfig;
  private readonly meetings: ZoomLiveMeeting[];

  constructor(overrides: Partial<SimulatorConfig> = {}) {
    this.config = { ...DEFAULT_SIMULATOR_CONFIG, ...overrides };
    this.meetings = buildMeetings(this.config);
  }

  private async delay(): Promise<void> {
    if (this.config.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.config.latencyMs));
    }
  }

  /** Lanza el error configurado, para ensayar los mensajes de la seccion 41. */
  private throwIfFaulty(): void {
    if (!this.config.fault) return;
    throw new ZoomApiError({
      code: this.config.fault,
      technicalDetail: `Error inyectado por el simulador: ${this.config.fault}.`,
      retryable: false,
    });
  }

  async listLiveMeetings(): Promise<ZoomLiveMeeting[]> {
    await this.delay();
    this.throwIfFaulty();
    return this.meetings;
  }

  async listLiveParticipants(meetingUuid: string): Promise<ZoomLiveParticipant[]> {
    await this.delay();
    this.throwIfFaulty();

    const meeting = this.meetings.find((m) => m.uuid === meetingUuid);
    if (!meeting) {
      throw new ZoomApiError({
        code: 'MEETING_NOT_FOUND',
        technicalDetail: `El simulador no tiene la reunion ${meetingUuid}.`,
      });
    }

    const base = buildBaseRoster(
      meeting.uuid,
      meeting.host,
      meeting.email,
      this.config.participantsPerMeeting,
      this.config,
    );

    const roster = applyDrift(base, meeting.uuid, this.config);
    const startedAt = new Date(meeting.start_time).getTime();

    return roster.map((p) => ({
      // Zoom oculta el id de los invitados por PII: el simulador hace lo mismo,
      // para que el resto del sistema no se acostumbre a un dato que no tendra.
      id: p.email ? p.key : undefined,
      user_id: p.zoomUserId ?? undefined,
      user_name: p.userName,
      device: p.device,
      location: 'Chile',
      network_type: 'Wifi',
      join_time: new Date(startedAt + p.arrivalOrder * 1200).toISOString(),
    }));
  }

  async getMeetingSettings(meetingId: string): Promise<ZoomMeetingSettings> {
    await this.delay();

    const meeting =
      this.meetings.find((m) => m.uuid === meetingId) ??
      this.meetings.find((m) => String(m.id) === String(meetingId));

    if (!meeting) {
      throw new ZoomApiError({
        code: 'MEETING_NOT_FOUND',
        technicalDetail: `El simulador no tiene la reunion ${meetingId}.`,
      });
    }

    const roster = buildBaseRoster(
      meeting.uuid,
      meeting.host,
      meeting.email,
      this.config.participantsPerMeeting,
      { ...this.config, freezeRoster: true },
    );

    const hostEmail = meeting.email;
    const alternativeHosts = roster
      .filter((p) => p.email && p.email !== hostEmail)
      .map((p) => p.email)
      .filter((e): e is string => Boolean(e));

    return {
      id: meeting.id,
      uuid: meeting.uuid,
      topic: meeting.topic,
      host_id: `host-${hashSeed(meeting.uuid) % 100000}`,
      host_email: meeting.email,
      settings: { alternative_hosts: alternativeHosts.join(';') },
    };
  }

  async listAccountUsers(): Promise<ZoomAccountUser[]> {
    await this.delay();
    return ROOM_ACCOUNTS.map((room, i) => ({
      id: `sim-user-${i}`,
      email: `${room}.adipa@simulador.local`,
      first_name: 'Sala',
      last_name: room.replace('sala', ''),
      status: 'active',
    }));
  }

  /** Metadatos de la cuenta simulada, para pintarla en el panel de administracion. */
  static accountInfo() {
    return {
      zoomAccountId: SIM_ACCOUNT_ID,
      displayName: 'ADIPA (simulador)',
      ownerEmail: 'simulador@adipa.local',
      roomCount: ROOM_ACCOUNTS.length,
    };
  }
}
