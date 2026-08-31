/**
 * Lectura de la BDD manual (secciones 20 y 21).
 *
 * Es el mecanismo de respaldo cuando Zoom no responde. Lo unico que hace este
 * modulo es EXTRAER nombres del archivo: la elegibilidad la decide despues el
 * mismo motor que se aplica a los participantes de Zoom (seccion 21). Nunca se
 * asume que alguien puede participar solo por aparecer en el Excel.
 */

import 'server-only';
import ExcelJS from 'exceljs';
import { MAX_IMPORT_ROWS } from './import-limits';


export { MAX_IMPORT_ROWS } from './import-limits';

export type ImportErrorCode = 'INVALID_FORMAT' | 'EMPTY_FILE' | 'NO_NAME_COLUMN' | 'TOO_MANY_ROWS';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
    this.name = 'ImportError';
  }
}

export interface ImportedParticipant {
  displayName: string;
  email: string | null;
}

export interface ImportResult {
  participants: ImportedParticipant[];
  /** Encabezado detectado, para mostrarle al operador que columna se uso. */
  nameColumnHeader: string | null;
  emailColumnHeader: string | null;
  /** Filas descartadas por estar vacias. */
  skippedRows: number;
}

/** Encabezados que identifican la columna de nombres, en ambos idiomas. */
const NAME_HEADERS = [
  'nombre',
  'nombres',
  'nombre completo',
  'nombre y apellido',
  'participante',
  'participantes',
  'asistente',
  'name',
  'full name',
  'user name',
  'username',
  'display name',
  'attendee',
  'participant',
];

const EMAIL_HEADERS = ['email', 'correo', 'correo electronico', 'e-mail', 'mail'];

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';

  if (typeof value === 'object') {
    // Celdas con formato enriquecido, formulas o hipervinculos.
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return String(value.result ?? '');
    if (value instanceof Date) return value.toISOString();
    return '';
  }

  return String(value);
}

/**
 * Busca la fila de encabezados en las primeras filas.
 *
 * Se recorren varias porque los exportados de Zoom y las planillas hechas a mano
 * suelen traer titulos o filas en blanco antes de la tabla real.
 */
function findHeader(sheet: ExcelJS.Worksheet): {
  headerRow: number;
  nameCol: number;
  emailCol: number | null;
  nameHeader: string;
  emailHeader: string | null;
} | null {
  const limit = Math.min(sheet.rowCount, 15);

  for (let rowNumber = 1; rowNumber <= limit; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    let nameCol = 0;
    let emailCol: number | null = null;
    let nameHeader = '';
    let emailHeader: string | null = null;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell);
      const folded = fold(text);
      if (!nameCol && NAME_HEADERS.includes(folded)) {
        nameCol = colNumber;
        nameHeader = text.trim();
      }
      if (emailCol === null && EMAIL_HEADERS.includes(folded)) {
        emailCol = colNumber;
        emailHeader = text.trim();
      }
    });

    if (nameCol) return { headerRow: rowNumber, nameCol, emailCol, nameHeader, emailHeader };
  }

  return null;
}

/**
 * Lee el archivo y devuelve los nombres encontrados.
 *
 * Acepta .xlsx y .csv. Si no hay encabezado reconocible pero la primera columna
 * contiene texto, se usa esa columna: es lo que hace una planilla pegada a mano,
 * y negarse ahi dejaria al operador sin respaldo justo cuando mas lo necesita.
 */
export async function parseParticipantsFile(
  buffer: Buffer,
  fileName: string,
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  const isCsv = fileName.toLowerCase().endsWith('.csv');

  try {
    if (isCsv) {
      const { Readable } = await import('node:stream');
      await workbook.csv.read(Readable.from(buffer.toString('utf8')));
    } else {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    }
  } catch {
    throw new ImportError('INVALID_FORMAT');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) throw new ImportError('EMPTY_FILE');

  const header = findHeader(sheet);

  // Sin encabezado: se asume la primera columna, siempre que tenga texto.
  const nameCol = header?.nameCol ?? 1;
  const emailCol = header?.emailCol ?? null;
  const firstDataRow = header ? header.headerRow + 1 : 1;

  if (!header) {
    const firstCell = cellText(sheet.getRow(1).getCell(1)).trim();
    if (!firstCell) throw new ImportError('NO_NAME_COLUMN');
  }

  const participants: ImportedParticipant[] = [];
  let skippedRows = 0;

  for (let rowNumber = firstDataRow; rowNumber <= sheet.rowCount; rowNumber++) {
    if (participants.length >= MAX_IMPORT_ROWS) throw new ImportError('TOO_MANY_ROWS');

    const row = sheet.getRow(rowNumber);
    const displayName = cellText(row.getCell(nameCol)).trim();

    if (!displayName) {
      skippedRows++;
      continue;
    }

    const email = emailCol ? cellText(row.getCell(emailCol)).trim() : '';
    participants.push({ displayName, email: email || null });
  }

  if (participants.length === 0) throw new ImportError('EMPTY_FILE');

  return {
    participants,
    nameColumnHeader: header?.nameHeader ?? null,
    emailColumnHeader: header?.emailHeader ?? null,
    skippedRows,
  };
}
