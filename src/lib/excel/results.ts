/**
 * Exportacion de resultados a XLSX (seccion 36).
 *
 * Dos hojas:
 *  - Resultados: los ganadores PRIMERO, luego el resto del universo elegible.
 *  - Resumen: metadatos que permiten auditar el sorteo despues (seccion 55),
 *    incluida la huella SHA-256 del universo sobre el que se sorteo.
 */

import 'server-only';
import ExcelJS from 'exceljs';

/** Marcas diacriticas combinantes, para el nombre de archivo. */
const COMBINING_MARKS = /[̀-ͯ]/g;

const BRAND_PURPLE = 'FF704EFD';
const BRAND_SURFACE = 'FFF3F4FF';
const BORDER_SUBTLE = 'FFE3E8F3';

export interface ResultRow {
  position: number;
  name: string;
  /** "GANADOR" o "Participante", ya traducido. */
  result: string;
  /** Marca la fila para destacarla. No se deduce del texto, que cambia por idioma. */
  isWinner: boolean;
  status: string;
  validatedBy: string | null;
  validatedAt: Date | null;
}

export interface ResultsExportInput {
  meetingTopic: string;
  zoomAccountName: string;
  drawSequence: number;
  drawStartedAt: Date;
  operatorName: string | null;
  snapshotSequence: number;
  snapshotCapturedAt: Date;
  poolSize: number;
  poolHash: string;
  totalFound: number;
  totalEligible: number;
  totalExcluded: number;
  rows: ResultRow[];
  locale: string;
  labels: {
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
  };
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { name: 'Poppins', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } };
  row.alignment = { vertical: 'middle' };
  row.height = 24;
}

export async function buildResultsWorkbook(input: ResultsExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sorteos Adipa';
  workbook.created = new Date();

  // ─────────────────────────── Hoja de resultados ───────────────────────────

  const sheet = workbook.addWorksheet(input.labels.sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: input.labels.position, key: 'position', width: 11 },
    { header: input.labels.name, key: 'name', width: 38 },
    { header: input.labels.result, key: 'result', width: 16 },
    { header: input.labels.status, key: 'status', width: 16 },
    { header: input.labels.validatedBy, key: 'validatedBy', width: 26 },
    { header: input.labels.date, key: 'date', width: 14 },
    { header: input.labels.time, key: 'time', width: 12 },
    { header: input.labels.draw, key: 'draw', width: 10 },
    { header: input.labels.meeting, key: 'meeting', width: 42 },
  ];

  styleHeaderRow(sheet.getRow(1));

  for (const row of input.rows) {
    const added = sheet.addRow({
      position: row.position,
      name: row.name,
      result: row.result,
      status: row.status,
      validatedBy: row.validatedBy ?? '',
      date: row.validatedAt ? row.validatedAt.toLocaleDateString(input.locale) : '',
      time: row.validatedAt
        ? row.validatedAt.toLocaleTimeString(input.locale, { hour: '2-digit', minute: '2-digit' })
        : '',
      draw: `#${input.drawSequence}`,
      meeting: input.meetingTopic,
    });

    // Los ganadores se destacan: es lo primero que se busca al abrir el archivo.
    added.font = row.isWinner
      ? { name: 'Poppins', size: 10, bold: true }
      : { name: 'Poppins', size: 10 };

    if (row.isWinner) {
      added.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SURFACE } };
    }

    added.border = {
      bottom: { style: 'thin', color: { argb: BORDER_SUBTLE } },
    };
  }

  sheet.autoFilter = { from: 'A1', to: `I${input.rows.length + 1}` };

  // ─────────────────────────── Hoja de resumen ───────────────────────────

  const summary = workbook.addWorksheet(input.labels.summary);
  summary.columns = [
    { key: 'field', width: 32 },
    { key: 'value', width: 70 },
  ];

  const entries: [string, string | number][] = [
    [input.labels.meeting, input.meetingTopic],
    ['Cuenta Zoom', input.zoomAccountName],
    [input.labels.draw, `#${input.drawSequence}`],
    ['Fecha del sorteo', input.drawStartedAt.toLocaleDateString(input.locale)],
    ['Hora del sorteo', input.drawStartedAt.toLocaleTimeString(input.locale)],
    ['Operador', input.operatorName ?? ''],
    ['Snapshot utilizado', `#${input.snapshotSequence}`],
    ['Snapshot extraido', input.snapshotCapturedAt.toLocaleString(input.locale)],
    ['Participantes encontrados', input.totalFound],
    ['Usuarios seleccionados', input.totalEligible],
    ['Usuarios excluidos', input.totalExcluded],
    ['Universo del sorteo', input.poolSize],
    ['Huella del universo (SHA-256)', input.poolHash],
  ];

  for (const [field, value] of entries) {
    const row = summary.addRow({ field, value });
    row.getCell('field').font = { name: 'Poppins', size: 10, bold: true };
    row.getCell('value').font = { name: 'Poppins', size: 10 };
  }

  // La huella es larga: en fuente monoespaciada se puede comparar a ojo.
  summary.getRow(entries.length).getCell('value').font = { name: 'Consolas', size: 9 };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** Nombre de archivo del Excel (seccion 36). */
export function resultsFileName(topic: string, date: Date): string {
  const slug = topic
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);

  const stamp = date.toISOString().slice(0, 10);
  return `resultados-${slug}-${stamp}.xlsx`;
}
