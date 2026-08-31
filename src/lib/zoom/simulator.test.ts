/**
 * Tests del simulador.
 *
 * Valen doble: verifican el simulador Y ejercitan el motor de elegibilidad de
 * punta a punta sobre una sala realista de cientos de personas, que es algo que
 * los tests unitarios con listas de 5 nombres no cubren.
 */

import { describe, expect, it } from 'vitest';
import { ZoomSimulator } from './simulator';
import { evaluateParticipants } from '../eligibility/engine';
import type { RawParticipant } from '../eligibility/types';
import { buildRoleContext } from './roleContext';

const frozen = (overrides = {}) =>
  new ZoomSimulator({ freezeRoster: true, latencyMs: 0, ...overrides });

async function evaluateMeeting(sim: ZoomSimulator, uuid: string) {
  const [participants, settings, accountUsers] = await Promise.all([
    sim.listLiveParticipants(uuid),
    sim.getMeetingSettings(uuid),
    sim.listAccountUsers(),
  ]);

  // Se mapea EXACTAMENTE lo que entrega la Dashboard API: sin email, porque su
  // respuesta no lo incluye. Si el motor dependiera del email, aqui se caeria.
  const raws: RawParticipant[] = participants.map((p) => ({
    externalId: p.id ?? null,
    displayName: p.user_name,
    zoomUserId: p.user_id ?? null,
    email: null,
    device: p.device ?? null,
    joinTime: p.join_time ? new Date(p.join_time) : null,
  }));

  return evaluateParticipants(raws, buildRoleContext({ settings, accountUsers }));
}

describe('reuniones simultaneas (seccion 4 y seccion 54)', () => {
  it('expone la cantidad de reuniones en vivo configurada', async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const meetings = await frozen({ liveMeetings: n }).listLiveMeetings();
      expect(meetings).toHaveLength(n);
    }
  });

  it('cada reunion tiene uuid propio, topic y host', async () => {
    const meetings = await frozen({ liveMeetings: 5 }).listLiveMeetings();
    expect(new Set(meetings.map((m) => m.uuid)).size).toBe(5);
    for (const m of meetings) {
      expect(m.topic.length).toBeGreaterThan(3);
      expect(m.host.length).toBeGreaterThan(3);
      expect(new Date(m.start_time).getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it('NUNCA mezcla participantes entre reuniones (seccion 54)', async () => {
    const sim = frozen({ liveMeetings: 3, participantsPerMeeting: 200 });
    const meetings = await sim.listLiveMeetings();

    const rosters = await Promise.all(meetings.map((m) => sim.listLiveParticipants(m.uuid)));
    const [a, b, c] = rosters.map((r) => new Set(r.map((p) => p.user_name)));

    // Salas distintas comparten a lo sumo homonimos casuales, no la mayoria de la sala.
    const overlap = [...a].filter((n) => b.has(n)).length;
    expect(overlap).toBeLessThan(a.size * 0.15);
    expect(c.size).toBeGreaterThan(150);
  });

  it('rechaza una reunion que no existe', async () => {
    await expect(frozen().listLiveParticipants('no-existe')).rejects.toMatchObject({
      code: 'MEETING_NOT_FOUND',
    });
  });
});

describe('reproduce los numeros de referencia del spec', () => {
  it('486 encontrados / 421 seleccionados / 65 excluidos', async () => {
    const sim = frozen({ liveMeetings: 1, participantsPerMeeting: 486 });
    const [meeting] = await sim.listLiveMeetings();
    const result = await evaluateMeeting(sim, meeting.uuid);

    expect(result.totalFound).toBe(486);
    expect(result.totalEligible).toBe(421);
    expect(result.totalExcluded).toBe(65);
  });

  it('el desglose por motivo cubre todas las reglas del spec', async () => {
    const sim = frozen({ liveMeetings: 1, participantsPerMeeting: 486 });
    const [meeting] = await sim.listLiveMeetings();
    const { byReason } = await evaluateMeeting(sim, meeting.uuid);

    expect(byReason.HOST).toBe(1);
    expect(byReason.CO_HOST).toBe(2);
    expect(byReason.ADIPA_NAME).toBe(7);
    expect(byReason.DEVICE_NAME).toBe(20);
    expect(byReason.INCOMPLETE_NAME).toBe(27);
    expect(byReason.DUPLICATE_NAME).toBe(8);
  });

  it('los nombres con dispositivo pero con persona identificable SI participan', async () => {
    const sim = frozen({ liveMeetings: 1, participantsPerMeeting: 486 });
    const [meeting] = await sim.listLiveMeetings();
    const { participants } = await evaluateMeeting(sim, meeting.uuid);

    const conDispositivo = participants.filter((p) =>
      /iPhone|Android|Galaxy|MacBook|iPad/i.test(p.displayName),
    );
    const elegiblesConDispositivo = conDispositivo.filter((p) => p.eligible);

    expect(elegiblesConDispositivo.length).toBe(30);
    for (const p of elegiblesConDispositivo) {
      expect(p.personName).toBeTruthy();
      expect(p.personName!.split(' ').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('volumen (seccion 22)', () => {
  it('maneja 1.000 participantes', async () => {
    const sim = frozen({ liveMeetings: 1, participantsPerMeeting: 1000 });
    const [meeting] = await sim.listLiveMeetings();
    const result = await evaluateMeeting(sim, meeting.uuid);

    expect(result.totalFound).toBe(1000);
    expect(result.totalEligible + result.totalExcluded).toBe(1000);
    // La proporcion de excluidos se mantiene en torno al 13% al escalar.
    expect(result.totalExcluded / 1000).toBeGreaterThan(0.08);
    expect(result.totalExcluded / 1000).toBeLessThan(0.20);
  });

  it('evalua 1.000 participantes en menos de un segundo', async () => {
    const sim = frozen({ liveMeetings: 1, participantsPerMeeting: 1000 });
    const [meeting] = await sim.listLiveMeetings();

    const started = Date.now();
    await evaluateMeeting(sim, meeting.uuid);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('determinismo', () => {
  it('la misma semilla produce la misma sala', async () => {
    const a = frozen({ liveMeetings: 1, seed: 42 });
    const b = frozen({ liveMeetings: 1, seed: 42 });

    const [ma] = await a.listLiveMeetings();
    const [mb] = await b.listLiveMeetings();

    const ra = await a.listLiveParticipants(ma.uuid);
    const rb = await b.listLiveParticipants(mb.uuid);

    expect(ra.map((p) => p.user_name)).toEqual(rb.map((p) => p.user_name));
  });

  it('semillas distintas producen salas distintas', async () => {
    const a = frozen({ liveMeetings: 1, seed: 1 });
    const b = frozen({ liveMeetings: 1, seed: 2 });

    const [ma] = await a.listLiveMeetings();
    const [mb] = await b.listLiveMeetings();

    const na = (await a.listLiveParticipants(ma.uuid)).map((p) => p.user_name);
    const nb = (await b.listLiveParticipants(mb.uuid)).map((p) => p.user_name);

    expect(na).not.toEqual(nb);
  });
});

describe('deriva del roster (seccion 11)', () => {
  it('sin congelar, el roster cambia con el tiempo', async () => {
    const sim = new ZoomSimulator({ liveMeetings: 1, participantsPerMeeting: 300, latencyMs: 0 });
    const [meeting] = await sim.listLiveMeetings();

    const primera = await sim.listLiveParticipants(meeting.uuid);
    // El bucket de deriva avanza cada 30 s; se simula saltando el reloj.
    const real = Date.now;
    Date.now = () => real() + 120_000;
    const segunda = await sim.listLiveParticipants(meeting.uuid);
    Date.now = real;

    expect(segunda.map((p) => p.user_name)).not.toEqual(primera.map((p) => p.user_name));
    // Pero sigue siendo la misma sala: la mayoria de la gente continua ahi.
    const nombres = new Set(primera.map((p) => p.user_name));
    const permanecen = segunda.filter((p) => nombres.has(p.user_name)).length;
    expect(permanecen / segunda.length).toBeGreaterThan(0.9);
  });

  it('congelado, el roster es estable', async () => {
    const sim = frozen({ liveMeetings: 1, participantsPerMeeting: 100 });
    const [meeting] = await sim.listLiveMeetings();

    const a = await sim.listLiveParticipants(meeting.uuid);
    const b = await sim.listLiveParticipants(meeting.uuid);
    expect(a.map((p) => p.user_name)).toEqual(b.map((p) => p.user_name));
  });
});

describe('inyeccion de errores (seccion 41)', () => {
  it.each([
    'TIMEOUT',
    'PLAN_NOT_SUPPORTED',
    'TOKEN_EXPIRED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'UNAVAILABLE',
  ] as const)('puede simular el error %s', async (fault) => {
    const sim = frozen({ fault });
    await expect(sim.listLiveMeetings()).rejects.toMatchObject({ code: fault });
  });

  it('sin fallo configurado, responde normal', async () => {
    await expect(frozen().listLiveMeetings()).resolves.toBeInstanceOf(Array);
  });
});

describe('identidad y roles', () => {
  it('expone host_email y alternative_hosts para la cascada de roles', async () => {
    const sim = frozen({ liveMeetings: 1 });
    const [meeting] = await sim.listLiveMeetings();
    const settings = await sim.getMeetingSettings(meeting.uuid);

    expect(settings.host_email).toBe(meeting.email);
    expect(settings.settings?.alternative_hosts?.split(';')).toHaveLength(2);
  });

  it('oculta el id de los invitados, igual que Zoom por PII', async () => {
    const sim = frozen({ liveMeetings: 1, participantsPerMeeting: 200 });
    const [meeting] = await sim.listLiveMeetings();
    const roster = await sim.listLiveParticipants(meeting.uuid);

    const conId = roster.filter((p) => p.id);
    // Solo host y co-hosts traen id.
    expect(conId.length).toBe(3);
  });

  it('lista las 17 salas de la organizacion', async () => {
    const users = await frozen().listAccountUsers();
    expect(users).toHaveLength(17);
  });
});
