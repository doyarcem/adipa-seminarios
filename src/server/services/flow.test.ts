/**
 * Test de integracion del flujo completo del operador (seccion 62).
 *
 *   Seleccionar reunion -> Extraer -> Revisar -> Configurar -> Sortear
 *   -> Ganador -> Al agua -> Validar
 *
 * Corre contra el simulador de Zoom y el almacen en memoria, sin red ni base de
 * datos. Es la red de seguridad que verifica que las piezas encajan: los tests
 * unitarios prueban cada motor por separado, este prueba que el conjunto funciona.
 */

import { beforeEach, describe, expect, it } from 'vitest';

process.env.ZOOM_MODE = 'simulator';
process.env.ZOOM_SIM_LATENCY_MS = '0';

const { resetMemoryStore } = await import('../store/memory');
const { getStore } = await import('../context');
const { listActiveMeetings, extractParticipants } = await import('./meetings');
const { executeDraw, sendAlAgua, validateWinner, DrawError } = await import('./draws');

const actor = { userId: 'op-1', email: 'sala1.virtualys@gmail.com', name: 'Operador Sala 1' };

async function extractFirstMeeting() {
  const { meetings } = await listActiveMeetings();
  const meeting = meetings[0];

  const snapshot = await extractParticipants({
    zoomAccountId: meeting.zoomAccountId,
    zoomAccountName: meeting.zoomAccountName,
    meetingUuid: meeting.uuid,
    meetingId: meeting.meetingId,
    topic: meeting.topic,
    hostName: meeting.hostName,
    startTime: meeting.startTime,
    actor,
  });

  return { meeting, ...snapshot };
}

beforeEach(() => {
  resetMemoryStore();
});

describe('seleccion de reunion (seccion 9)', () => {
  it('lista las reuniones activas con los datos que necesita la tarjeta', async () => {
    const { meetings, failedAccounts } = await listActiveMeetings();

    expect(failedAccounts).toEqual([]);
    expect(meetings.length).toBeGreaterThan(0);

    for (const m of meetings) {
      expect(m.topic).toBeTruthy();
      expect(m.zoomAccountName).toBeTruthy();
      expect(m.hostName).toBeTruthy();
      expect(m.uuid).toBeTruthy();
      expect(new Date(m.startTime).toString()).not.toBe('Invalid Date');
    }
  });

  it('marca las reuniones que aun no tienen snapshot', async () => {
    const { meetings } = await listActiveMeetings();
    expect(meetings.every((m) => !m.hasActiveSnapshot)).toBe(true);

    await extractFirstMeeting();

    const despues = await listActiveMeetings();
    expect(despues.meetings.filter((m) => m.hasActiveSnapshot)).toHaveLength(1);
  });
});

describe('extraccion y snapshot (secciones 10 y 11)', () => {
  it('crea el snapshot con los totales y la hora exacta', async () => {
    const antes = Date.now();
    const { snapshot, participants } = await extractFirstMeeting();

    expect(snapshot.sequence).toBe(1);
    expect(snapshot.source).toBe('ZOOM_DASHBOARD');
    expect(snapshot.isActive).toBe(true);
    expect(snapshot.capturedAt.getTime()).toBeGreaterThanOrEqual(antes);

    expect(participants).toHaveLength(snapshot.totalFound);
    expect(snapshot.totalEligible + snapshot.totalExcluded).toBe(snapshot.totalFound);
    expect(participants.filter((p) => p.eligible)).toHaveLength(snapshot.totalEligible);
  });

  it('cada excluido tiene motivo y traza explicable (seccion 18)', async () => {
    const { participants } = await extractFirstMeeting();

    for (const p of participants.filter((x) => !x.eligible)) {
      expect(p.exclusionReason).toBeTruthy();
      expect(p.evaluationTrace.length).toBeGreaterThan(0);
    }
  });

  it('actualizar crea un snapshot NUEVO y conserva el anterior', async () => {
    const { meeting } = await extractFirstMeeting();
    const store = getStore();

    const record = await store.findMeetingByUuid(meeting.zoomAccountId, meeting.uuid);
    const primero = await store.getActiveSnapshot(record!.id);

    await extractParticipants({
      zoomAccountId: meeting.zoomAccountId,
      zoomAccountName: meeting.zoomAccountName,
      meetingUuid: meeting.uuid,
      meetingId: meeting.meetingId,
      topic: meeting.topic,
      hostName: meeting.hostName,
      startTime: meeting.startTime,
      actor,
    });

    const todos = await store.listSnapshots(record!.id);
    expect(todos).toHaveLength(2);
    expect(todos.filter((s) => s.isActive)).toHaveLength(1);

    // El anterior sigue existiendo, solo dejo de ser el activo.
    const anterior = await store.getSnapshot(primero!.snapshot.id);
    expect(anterior).not.toBeNull();
    expect(anterior!.snapshot.isActive).toBe(false);
    expect(anterior!.participants.length).toBeGreaterThan(0);
  });
});

describe('edicion manual (seccion 19)', () => {
  it('incluir a un excluido lo suma al universo y queda auditado', async () => {
    const { snapshot, participants } = await extractFirstMeeting();
    const store = getStore();

    const excluido = participants.find((p) => p.exclusionReason === 'INCOMPLETE_NAME')!;
    const actualizado = await store.setManualOverride(excluido.id, true, actor);

    expect(actualizado.eligible).toBe(true);
    expect(actualizado.manualOverride).toBe(true);

    const recargado = await store.getSnapshot(snapshot.id);
    expect(recargado!.snapshot.totalEligible).toBe(snapshot.totalEligible + 1);

    const audit = await store.listAudit();
    const evento = audit.find((e) => e.action === 'PARTICIPANT_INCLUDED');
    expect(evento).toBeTruthy();
    expect(evento!.actorEmail).toBe(actor.email);
    expect(evento!.detail).toMatchObject({ previousState: false, newState: true });
  });

  it('NO permite incluir al host ni a un co-host (seccion 16)', async () => {
    const { participants } = await extractFirstMeeting();
    const store = getStore();

    const host = participants.find((p) => p.detectedRole === 'HOST')!;
    const coHost = participants.find((p) => p.detectedRole === 'CO_HOST')!;

    await expect(store.setManualOverride(host.id, true, actor)).rejects.toThrow('ROLE_LOCKED');
    await expect(store.setManualOverride(coHost.id, true, actor)).rejects.toThrow('ROLE_LOCKED');
  });
});

describe('ejecucion del sorteo (secciones 23, 25 y 55)', () => {
  it('sortea sobre los elegibles y registra la huella del universo', async () => {
    const { snapshot } = await extractFirstMeeting();

    const { draw, winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 3,
      countdownSeconds: 5,
      actor,
    });

    expect(draw.sequence).toBe(1);
    expect(draw.status).toBe('COMPLETED');
    expect(draw.poolSize).toBe(snapshot.totalEligible);
    expect(draw.poolHash).toMatch(/^[0-9a-f]{64}$/);
    expect(winners).toHaveLength(3);
    expect(winners.map((w) => w.position)).toEqual([1, 2, 3]);
    expect(new Set(winners.map((w) => w.participantId)).size).toBe(3);
  });

  it('los ganadores salen del universo elegible, nunca de los excluidos', async () => {
    const { snapshot, participants } = await extractFirstMeeting();
    const elegibles = new Set(participants.filter((p) => p.eligible).map((p) => p.id));

    const { winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 10,
      countdownSeconds: 5,
      actor,
    });

    for (const w of winners) expect(elegibles.has(w.participantId)).toBe(true);
  });

  it('sin snapshot no se puede sortear', async () => {
    await expect(
      executeDraw({ meetingId: 'inexistente', requestedWinners: 1, countdownSeconds: 5, actor }),
    ).rejects.toBeInstanceOf(DrawError);
  });
});

describe('multiples sorteos (seccion 24)', () => {
  it('un ganador anterior no vuelve a ganar', async () => {
    const { snapshot } = await extractFirstMeeting();
    const yaGanaron = new Set<string>();

    for (let i = 1; i <= 5; i++) {
      const { draw, winners } = await executeDraw({
        meetingId: snapshot.meetingId,
        requestedWinners: 2,
        countdownSeconds: 5,
        actor,
      });

      expect(draw.sequence).toBe(i);
      for (const w of winners) {
        expect(yaGanaron.has(w.winnerName)).toBe(false);
        yaGanaron.add(w.winnerName);
      }
    }

    expect(yaGanaron.size).toBe(10);
  });

  it('el universo se achica sorteo a sorteo', async () => {
    const { snapshot } = await extractFirstMeeting();

    const primero = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 5,
      countdownSeconds: 5,
      actor,
    });
    const segundo = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 5,
      countdownSeconds: 5,
      actor,
    });

    expect(segundo.draw.poolSize).toBe(primero.draw.poolSize - 5);
  });
});

describe('Al agua (seccion 12)', () => {
  it('reemplaza al ganador usando el MISMO snapshot, sin reconsultar Zoom', async () => {
    const { snapshot } = await extractFirstMeeting();

    const { draw, winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 1,
      countdownSeconds: 5,
      actor,
    });

    const { replaced, replacement } = await sendAlAgua({
      winnerId: winners[0].id,
      reason: 'Ya no esta en la reunion',
      actor,
    });

    expect(replaced.status).toBe('AL_AGUA');
    expect(replaced.alAguaReason).toBe('Ya no esta en la reunion');
    expect(replacement.winnerName).not.toBe(replaced.winnerName);
    expect(replacement.position).toBe(replaced.position);

    // No se creo un snapshot nuevo: sigue habiendo uno solo.
    const store = getStore();
    expect(await store.listSnapshots(snapshot.meetingId)).toHaveLength(1);

    // Y el sorteo sigue apuntando al mismo snapshot.
    const recargado = await store.getDraw(draw.id);
    expect(recargado!.draw.snapshotId).toBe(snapshot.id);
  });

  it('al agua sucesivos nunca repiten a alguien ya descartado', async () => {
    const { snapshot } = await extractFirstMeeting();
    const { winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 1,
      countdownSeconds: 5,
      actor,
    });

    const vistos = [winners[0].winnerName];
    let actual = winners[0].id;

    for (let i = 0; i < 5; i++) {
      const { replacement } = await sendAlAgua({ winnerId: actual, reason: null, actor });
      expect(vistos).not.toContain(replacement.winnerName);
      vistos.push(replacement.winnerName);
      actual = replacement.id;
    }
  });

  it('un ganador YA VALIDADO no puede irse al agua', async () => {
    const { snapshot } = await extractFirstMeeting();
    const { winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 1,
      countdownSeconds: 5,
      actor,
    });

    await validateWinner(winners[0].id, actor);
    await expect(sendAlAgua({ winnerId: winners[0].id, reason: null, actor })).rejects.toBeInstanceOf(
      DrawError,
    );
  });

  it('quien se fue al agua NO queda bloqueado para futuros sorteos de la reunion', async () => {
    const { snapshot } = await extractFirstMeeting();
    const { winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 1,
      countdownSeconds: 5,
      actor,
    });

    await sendAlAgua({ winnerId: winners[0].id, reason: null, actor });

    const store = getStore();
    const previos = await store.listPreviousWinnerNames(snapshot.meetingId);
    expect(previos).not.toContain(winners[0].winnerName);
  });
});

describe('validacion del ganador (seccion 33)', () => {
  it('registra quien valido y cuando', async () => {
    const { snapshot } = await extractFirstMeeting();
    const { winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 1,
      countdownSeconds: 5,
      actor,
    });

    const validado = await validateWinner(winners[0].id, actor);

    expect(validado.status).toBe('VALIDATED');
    expect(validado.validatedById).toBe(actor.userId);
    expect(validado.validatedByName).toBe(actor.name);
    expect(validado.validatedAt).toBeInstanceOf(Date);
  });

  it('un descalificado no se puede validar', async () => {
    const { snapshot } = await extractFirstMeeting();
    const { winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 1,
      countdownSeconds: 5,
      actor,
    });

    await sendAlAgua({ winnerId: winners[0].id, reason: null, actor });
    await expect(validateWinner(winners[0].id, actor)).rejects.toBeInstanceOf(DrawError);
  });
});

describe('auditoria del flujo completo (seccion 38)', () => {
  it('deja rastro de cada paso importante', async () => {
    const { snapshot } = await extractFirstMeeting();
    const store = getStore();

    const { winners } = await executeDraw({
      meetingId: snapshot.meetingId,
      requestedWinners: 1,
      countdownSeconds: 5,
      actor,
    });
    await sendAlAgua({ winnerId: winners[0].id, reason: 'no esta', actor });

    const nuevo = (await store.getDraw(winners[0].drawId))!.winners.find((w) => w.status === 'PENDING')!;
    await validateWinner(nuevo.id, actor);

    const acciones = (await store.listAudit()).map((e) => e.action);
    expect(acciones).toContain('PARTICIPANTS_EXTRACTED');
    expect(acciones).toContain('DRAW_STARTED');
    expect(acciones).toContain('WINNER_SELECTED');
    expect(acciones).toContain('WINNER_AL_AGUA');
    expect(acciones).toContain('WINNER_VALIDATED');
  });

  it('el evento de extraccion guarda el desglose por motivo', async () => {
    await extractFirstMeeting();
    const audit = await getStore().listAudit();
    const evento = audit.find((e) => e.action === 'PARTICIPANTS_EXTRACTED')!;

    expect(evento.detail).toHaveProperty('byReason');
    expect(evento.detail).toHaveProperty('totalEligible');
  });
});

describe('aislamiento entre reuniones (seccion 54)', () => {
  it('cada reunion tiene su propio snapshot, sorteos y ganadores', async () => {
    const { meetings } = await listActiveMeetings();
    const store = getStore();

    const snapshots = [];
    for (const m of meetings.slice(0, 3)) {
      const s = await extractParticipants({
        zoomAccountId: m.zoomAccountId,
        zoomAccountName: m.zoomAccountName,
        meetingUuid: m.uuid,
        meetingId: m.meetingId,
        topic: m.topic,
        hostName: m.hostName,
        startTime: m.startTime,
        actor,
      });
      snapshots.push(s);
    }

    expect(new Set(snapshots.map((s) => s.snapshot.meetingId)).size).toBe(3);

    for (const s of snapshots) {
      await executeDraw({
        meetingId: s.snapshot.meetingId,
        requestedWinners: 2,
        countdownSeconds: 5,
        actor,
      });
    }

    for (const s of snapshots) {
      const draws = await store.listDraws(s.snapshot.meetingId);
      expect(draws).toHaveLength(1);
      expect(draws[0].draw.sequence).toBe(1);

      // Los ganadores de esta reunion pertenecen a SU snapshot, no a otro.
      const ids = new Set(s.participants.map((p) => p.id));
      for (const w of draws[0].winners) expect(ids.has(w.participantId)).toBe(true);
    }
  });
});
