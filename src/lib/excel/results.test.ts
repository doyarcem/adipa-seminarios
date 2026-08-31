import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildResultsWorkbook, resultsFileName, type ResultsExportInput } from './results';

const LABELS = {
  sheetName: 'Resultados',
  position: 'Posición',
  name: 'Nombre',
  result: 'Resultado',
  status: 'Estado',
  validatedBy: 'Validado por',
  date: 'Fecha',
  time: 'Hora',
  draw: 'Sorteo',
  meeting: 'Reunión',
  summary: 'Resumen',
};

const base: ResultsExportInput = {
  meetingTopic: 'Seminario Psicología 2026',
  zoomAccountName: 'ADIPA Chile',
  drawSequence: 2,
  drawStartedAt: new Date('2026-08-31T15:42:31'),
  operatorName: 'Operador Sala 1',
  snapshotSequence: 1,
  snapshotCapturedAt: new Date('2026-08-31T15:40:00'),
  poolSize: 421,
  poolHash: 'a'.repeat(64),
  totalFound: 486,
  totalEligible: 421,
  totalExcluded: 65,
  locale: 'es',
  labels: LABELS,
  rows: [
    {
      position: 1,
      name: 'Juan Pérez',
      result: 'GANADOR',
      isWinner: true,
      status: 'Validado por',
      validatedBy: 'Operador Sala 1',
      validatedAt: new Date('2026-08-31T15:45:00'),
    },
    {
      position: 2,
      name: 'María González',
      result: 'GANADOR',
      isWinner: true,
      status: '',
      validatedBy: null,
      validatedAt: null,
    },
    {
      position: 3,
      name: 'Pedro Soto',
      result: 'Participante',
      isWinner: false,
      status: '',
      validatedBy: null,
      validatedAt: null,
    },
  ],
};

async function read(input: ResultsExportInput) {
  const buffer = await buildResultsWorkbook(input);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return { buffer, workbook };
}

describe('seccion 36 - exportacion XLSX', () => {
  it('produce un archivo con las dos hojas', async () => {
    const { workbook } = await read(base);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Resultados', 'Resumen']);
  });

  it('los ganadores van primero', async () => {
    const { workbook } = await read(base);
    const sheet = workbook.getWorksheet('Resultados')!;

    expect(sheet.getRow(2).getCell(2).value).toBe('Juan Pérez');
    expect(sheet.getRow(2).getCell(3).value).toBe('GANADOR');
    expect(sheet.getRow(3).getCell(3).value).toBe('GANADOR');
    expect(sheet.getRow(4).getCell(3).value).toBe('Participante');
  });

  it('los encabezados salen traducidos', async () => {
    const { workbook } = await read(base);
    const header = workbook.getWorksheet('Resultados')!.getRow(1);

    expect(header.getCell(1).value).toBe('Posición');
    expect(header.getCell(2).value).toBe('Nombre');
    expect(header.getCell(3).value).toBe('Resultado');
  });

  it('registra la validacion del ganador', async () => {
    const { workbook } = await read(base);
    const row = workbook.getWorksheet('Resultados')!.getRow(2);

    expect(row.getCell(5).value).toBe('Operador Sala 1');
    expect(String(row.getCell(6).value)).toContain('2026');
  });

  it('la hoja de resumen guarda la huella del universo (seccion 55)', async () => {
    const { workbook } = await read(base);
    const summary = workbook.getWorksheet('Resumen')!;

    const values: string[] = [];
    summary.eachRow((row) => values.push(String(row.getCell(2).value)));

    expect(values).toContain('a'.repeat(64));
    expect(values).toContain('Seminario Psicología 2026');
    expect(values).toContain('ADIPA Chile');
    expect(values.map(Number)).toContain(486);
    expect(values.map(Number)).toContain(421);
  });

  it('funciona con etiquetas en ingles', async () => {
    const { workbook } = await read({
      ...base,
      locale: 'en',
      labels: { ...LABELS, sheetName: 'Results', position: 'Position', summary: 'Summary' },
      rows: base.rows.map((r) => ({ ...r, result: r.isWinner ? 'WINNER' : 'Participant' })),
    });

    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Results', 'Summary']);
    expect(workbook.getWorksheet('Results')!.getRow(2).getCell(3).value).toBe('WINNER');
  });

  it('aguanta un universo de 1.000 filas', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      position: i + 1,
      name: `Persona Apellido${String.fromCharCode(97 + (i % 26))}`,
      result: i === 0 ? 'GANADOR' : 'Participante',
      isWinner: i === 0,
      status: '',
      validatedBy: null,
      validatedAt: null,
    }));

    const { workbook, buffer } = await read({ ...base, rows });
    expect(workbook.getWorksheet('Resultados')!.rowCount).toBe(1001);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

describe('nombre de archivo', () => {
  it('usa el tema sin tildes y la fecha', () => {
    expect(resultsFileName('Seminario Psicología 2026', new Date('2026-08-31T12:00:00Z'))).toBe(
      'resultados-seminario-psicologia-2026-2026-08-31.xlsx',
    );
  });
});
