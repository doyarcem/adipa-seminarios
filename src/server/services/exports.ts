/**
 * Armado de los archivos descargables: comprobante JPG (seccion 34) y
 * resultados XLSX (seccion 36).
 *
 * Los textos llegan ya traducidos desde la capa de rutas: este modulo no decide
 * idioma ni copy, solo compone los datos.
 */

import 'server-only';
import { certificateFileName, renderCertificate } from '@/lib/certificate/render';
import { buildResultsWorkbook, resultsFileName, type ResultRow } from '@/lib/excel/results';
import { getStore } from '../context';

export class ExportError extends Error {
  constructor(readonly code: 'DRAW_NOT_FOUND' | 'WINNER_NOT_FOUND' | 'NOT_VALIDATED') {
    super(code);
    this.name = 'ExportError';
  }
}

export interface CertificateLabels {
  eyebrow: string;
  headline: string;
  footer: string;
  dateLabel: string;
}

/**
 * Genera el comprobante de un ganador.
 *
 * Exige que el ganador este VALIDADO: la seccion 33 pone la validacion como paso
 * previo a la generacion, y emitir un comprobante de alguien que todavia no fue
 * comprobado seria emitir un documento sin respaldo.
 */
export async function generateCertificate(
  winnerId: string,
  variant: 'scholarship' | 'winner',
  locale: string,
  labels: CertificateLabels,
): Promise<{ buffer: Buffer; fileName: string }> {
  const store = getStore();

  const winner = await store.getWinner(winnerId);
  if (!winner) throw new ExportError('WINNER_NOT_FOUND');
  if (winner.status !== 'VALIDATED') throw new ExportError('NOT_VALIDATED');

  const draw = await store.getDraw(winner.drawId);
  if (!draw) throw new ExportError('DRAW_NOT_FOUND');

  const meeting = await store.getMeeting(draw.draw.meetingId);
  const topic = meeting?.topic ?? '';

  const buffer = renderCertificate({
    winnerName: winner.winnerName,
    meetingTopic: topic,
    date: winner.validatedAt ?? draw.draw.startedAt,
    variant,
    locale,
    labels,
  });

  const fileName = certificateFileName(winner.winnerName, topic);
  await store.attachCertificate(winnerId, fileName);

  return { buffer, fileName };
}

export interface ResultsLabels {
  sheetName: string;
  position: string;
  name: string;
  result: string;
  status: string;
  validatedBy: string;
  date: string;
  time: string;
  draw: string;
  meeting: string;
  summary: string;
  winner: string;
  participant: string;
}

/**
 * Genera el Excel de resultados de un sorteo.
 *
 * Orden: los ganadores vigentes primero, luego el resto del universo elegible.
 * Los enviados "al agua" aparecen al final con su estado, para que el archivo
 * cuente la historia completa y no solo el desenlace.
 */
export async function generateResults(
  drawId: string,
  locale: string,
  labels: ResultsLabels,
): Promise<{ buffer: Buffer; fileName: string }> {
  const store = getStore();

  const draw = await store.getDraw(drawId);
  if (!draw) throw new ExportError('DRAW_NOT_FOUND');

  const [meeting, snapshot] = await Promise.all([
    store.getMeeting(draw.draw.meetingId),
    store.getSnapshot(draw.draw.snapshotId),
  ]);

  const winners = draw.winners.filter((w) => w.status !== 'AL_AGUA');
  const disqualified = draw.winners.filter((w) => w.status === 'AL_AGUA');
  const winnerParticipantIds = new Set(draw.winners.map((w) => w.participantId));

  const rows: ResultRow[] = [];
  let position = 1;

  for (const winner of winners) {
    rows.push({
      position: position++,
      name: winner.winnerName,
      result: labels.winner,
      isWinner: true,
      status: winner.status === 'VALIDATED' ? labels.validatedBy : '',
      validatedBy: winner.validatedByName,
      validatedAt: winner.validatedAt,
    });
  }

  // Resto del universo elegible, en el orden en que Zoom los reporto.
  for (const participant of snapshot?.participants ?? []) {
    if (!participant.eligible || winnerParticipantIds.has(participant.id)) continue;
    rows.push({
      position: position++,
      name: participant.displayName,
      result: labels.participant,
      isWinner: false,
      status: '',
      validatedBy: null,
      validatedAt: null,
    });
  }

  for (const winner of disqualified) {
    rows.push({
      position: position++,
      name: winner.winnerName,
      result: labels.participant,
      isWinner: false,
      status: 'Al agua',
      validatedBy: null,
      validatedAt: winner.alAguaAt,
    });
  }

  const buffer = await buildResultsWorkbook({
    meetingTopic: meeting?.topic ?? '',
    zoomAccountName: meeting?.zoomAccountName ?? '',
    drawSequence: draw.draw.sequence,
    drawStartedAt: draw.draw.startedAt,
    operatorName: draw.draw.operatorName,
    snapshotSequence: snapshot?.snapshot.sequence ?? 0,
    snapshotCapturedAt: snapshot?.snapshot.capturedAt ?? draw.draw.startedAt,
    poolSize: draw.draw.poolSize,
    poolHash: draw.draw.poolHash,
    totalFound: snapshot?.snapshot.totalFound ?? 0,
    totalEligible: snapshot?.snapshot.totalEligible ?? 0,
    totalExcluded: snapshot?.snapshot.totalExcluded ?? 0,
    rows,
    locale,
    labels,
  });

  return {
    buffer,
    fileName: resultsFileName(meeting?.topic ?? 'sorteo', draw.draw.startedAt),
  };
}
