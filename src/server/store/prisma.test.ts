/**
 * Test de integracion del almacen en Postgres.
 *
 * NO se ejecuta por defecto: necesita una base real. Para correrlo:
 *
 *   TEST_DATABASE_URL="postgresql://..." npm test
 *
 * Usa una base APARTE a proposito. El test escribe y borra datos, asi que apuntarlo
 * a la base de produccion destruiria el historial de sorteos. Por eso exige una
 * variable distinta de DATABASE_URL: no basta con tener la de produccion a mano.
 *
 * Verifica las mismas invariantes que ya cubre el flujo en memoria, para que las
 * dos implementaciones del contrato se comporten igual.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EvaluatedParticipant } from '@/lib/eligibility/types';

const TEST_URL = process.env.TEST_DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;

const actor = { userId: 'no-usado', email: 'monitor.test@ejemplo.com', name: 'Monitor de prueba' };

const meeting = {
  zoomAccountId: 'TEST-ACCOUNT',
  zoomAccountName: 'Cuenta de prueba',
  zoomMeetingUuid: 'test-uuid==',
  zoomMeetingId: '123456',
  topic: 'Seminario de prueba',
  hostName: 'Dra. Prueba',
  hostEmail: 'host@ejemplo.com',
  startTime: new Date('2026-09-09T12:00:00Z'),
};

/** Participante evaluado minimo, con la forma que espera createSnapshot. */
function participante(displayName: string, eligible = true): EvaluatedParticipant {
  return {
    key: displayName,
    raw: { displayName },
    displayName,
    normalizedName: displayName,
    personName: displayName,
    detectedRole: 'UNKNOWN',
    autoEligible: eligible,
    autoExclusionReason: eligible ? null : 'INCOMPLETE_NAME',
    manualOverride: null,
    eligible,
    exclusionReason: eligible ? null : 'INCOMPLETE_NAME',
    trace: ['nameTokens:2'],
  };
}

describe.skipIf(!TEST_URL)('PrismaDrawStore contra Postgres', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.DIRECT_URL = TEST_URL;

    ({ prisma } = await import('@/lib/db'));
    const { PrismaDrawStore } = await import('./prisma');
    store = new PrismaDrawStore();

    // Se parte de una base limpia para que los correlativos sean predecibles.
    await prisma.auditLog.deleteMany();
    await prisma.zoomAccount.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('crea la cuenta Zoom sola al guardar la primera reunion', async () => {
    const saved = await store.upsertMeeting(meeting);

    expect(saved.zoomAccountId).toBe('TEST-ACCOUNT');
    expect(saved.zoomAccountName).toBe('Cuenta de prueba');
    expect(saved.topic).toBe('Seminario de prueba');

    // Guardar dos veces la misma reunion no la duplica.
    const otraVez = await store.upsertMeeting(meeting);
    expect(otraVez.id).toBe(saved.id);
  });

  it('crea snapshots con correlativo y archiva el anterior', async () => {
    const primero = await store.createSnapshot({
      meeting,
      source: 'ZOOM_DASHBOARD',
      evaluated: [participante('Ana Perez'), participante('Luis Soto'), participante('Ana', false)],
      actor,
    });

    expect(primero.snapshot.sequence).toBe(1);
    expect(primero.snapshot.totalFound).toBe(3);
    expect(primero.snapshot.totalEligible).toBe(2);
    expect(primero.participants).toHaveLength(3);

    const segundo = await store.createSnapshot({
      meeting,
      source: 'ZOOM_DASHBOARD',
      evaluated: [participante('Ana Perez'), participante('Luis Soto')],
      actor,
    });

    expect(segundo.snapshot.sequence).toBe(2);

    // El anterior se conserva, solo deja de ser el activo.
    const anterior = await store.getSnapshot(primero.snapshot.id);
    expect(anterior?.snapshot.isActive).toBe(false);
    expect(anterior?.participants).toHaveLength(3);

    const activo = await store.getActiveSnapshot(segundo.snapshot.meetingId);
    expect(activo?.snapshot.id).toBe(segundo.snapshot.id);
  });

  it('ejecuta un sorteo y recupera al ganador por id', async () => {
    const snap = await store.getActiveSnapshot(
      (await store.findMeetingByUuid('TEST-ACCOUNT', 'test-uuid=='))!.id,
    );

    const draw = await store.createDraw({
      meetingId: snap!.snapshot.meetingId,
      snapshotId: snap!.snapshot.id,
      requestedWinners: 1,
      countdownSeconds: 5,
      poolSize: 2,
      poolHash: 'a'.repeat(64),
      actor,
    });

    const completado = await store.completeDraw(draw.id, [
      { participantId: snap!.participants[0].id, winnerName: snap!.participants[0].displayName },
    ]);

    expect(completado.draw.status).toBe('COMPLETED');
    expect(completado.winners).toHaveLength(1);

    // Esto es lo que fallaba en Vercel con el almacen en memoria: la descarga del
    // comprobante llega en otra peticion y tiene que encontrar al ganador.
    const recuperado = await store.getWinner(completado.winners[0].id);
    expect(recuperado?.winnerName).toBe(snap!.participants[0].displayName);
  });

  it('valida al ganador y asocia el comprobante', async () => {
    const meetingRow = await store.findMeetingByUuid('TEST-ACCOUNT', 'test-uuid==');
    const draws = await store.listDraws(meetingRow!.id);
    const winnerId = draws[0].winners[0].id;

    const validado = await store.validateWinner(winnerId, actor);
    expect(validado.status).toBe('VALIDATED');
    expect(validado.validatedByName).toBe('Monitor de prueba');

    const conComprobante = await store.attachCertificate(winnerId, 'comprobante-prueba.jpg');
    expect(conComprobante.certificateFileName).toBe('comprobante-prueba.jpg');
  });

  it('registra la auditoria del flujo', async () => {
    const eventos = await store.listAudit({ limit: 50 });
    const acciones = eventos.map((e: { action: string }) => e.action);

    expect(acciones).toContain('WINNER_VALIDATED');
  });
});
