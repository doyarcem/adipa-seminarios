import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ImportError, parseParticipantsFile } from './import';
import { evaluateParticipants } from '../eligibility/engine';

/** Construye un .xlsx en memoria a partir de filas. */
async function makeXlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Hoja 1');
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const csv = (text: string) => Buffer.from(text, 'utf8');

describe('seccion 20 - lectura del archivo', () => {
  it('detecta la columna por el encabezado "Nombre"', async () => {
    const buffer = await makeXlsx([
      ['Nombre', 'Correo'],
      ['Juan Pérez', 'juan@ejemplo.com'],
      ['María González', 'maria@ejemplo.com'],
    ]);

    const result = await parseParticipantsFile(buffer, 'lista.xlsx');
    expect(result.nameColumnHeader).toBe('Nombre');
    expect(result.emailColumnHeader).toBe('Correo');
    expect(result.participants).toEqual([
      { displayName: 'Juan Pérez', email: 'juan@ejemplo.com' },
      { displayName: 'María González', email: 'maria@ejemplo.com' },
    ]);
  });

  it.each(['Nombre', 'NOMBRE', 'Participante', 'Name', 'Full Name', 'Nombre completo'])(
    'reconoce el encabezado "%s"',
    async (headerText) => {
      const buffer = await makeXlsx([[headerText], ['Juan Pérez']]);
      const result = await parseParticipantsFile(buffer, 'lista.xlsx');
      expect(result.participants).toHaveLength(1);
    },
  );

  it('salta filas de titulo antes de la tabla', async () => {
    const buffer = await makeXlsx([
      ['Seminario Psicología 2026'],
      [],
      ['Nombre', 'Correo'],
      ['Juan Pérez', 'juan@ejemplo.com'],
    ]);

    const result = await parseParticipantsFile(buffer, 'lista.xlsx');
    expect(result.participants).toEqual([{ displayName: 'Juan Pérez', email: 'juan@ejemplo.com' }]);
  });

  it('usa la primera columna cuando no hay encabezado reconocible', async () => {
    const buffer = await makeXlsx([['Juan Pérez'], ['María González']]);
    const result = await parseParticipantsFile(buffer, 'lista.xlsx');

    expect(result.nameColumnHeader).toBeNull();
    expect(result.participants).toHaveLength(2);
  });

  it('ignora filas vacias y las cuenta', async () => {
    const buffer = await makeXlsx([['Nombre'], ['Juan Pérez'], [''], [null], ['María González']]);
    const result = await parseParticipantsFile(buffer, 'lista.xlsx');

    expect(result.participants).toHaveLength(2);
    expect(result.skippedRows).toBe(2);
  });

  it('lee archivos CSV', async () => {
    const result = await parseParticipantsFile(
      csv('Nombre,Correo\nJuan Pérez,juan@ejemplo.com\nMaría González,maria@ejemplo.com\n'),
      'lista.csv',
    );
    expect(result.participants).toHaveLength(2);
    expect(result.participants[0].displayName).toBe('Juan Pérez');
  });

  it('conserva tildes y mayusculas tal cual', async () => {
    const buffer = await makeXlsx([['Nombre'], ['MARÍA josé Ñuñez']]);
    const result = await parseParticipantsFile(buffer, 'lista.xlsx');
    expect(result.participants[0].displayName).toBe('MARÍA josé Ñuñez');
  });
});

describe('errores de archivo (seccion 41)', () => {
  it('rechaza un archivo que no es una planilla', async () => {
    await expect(parseParticipantsFile(Buffer.from('esto no es un xlsx'), 'x.xlsx')).rejects.toMatchObject(
      { code: 'INVALID_FORMAT' },
    );
  });

  it('rechaza una planilla sin filas de datos', async () => {
    const buffer = await makeXlsx([['Nombre']]);
    await expect(parseParticipantsFile(buffer, 'lista.xlsx')).rejects.toMatchObject({
      code: 'EMPTY_FILE',
    });
  });

  it('rechaza una planilla cuya primera celda esta vacia y no tiene encabezado', async () => {
    const buffer = await makeXlsx([[''], ['']]);
    await expect(parseParticipantsFile(buffer, 'lista.xlsx')).rejects.toBeInstanceOf(ImportError);
  });
});

describe('seccion 21 - el Excel pasa por las MISMAS reglas', () => {
  it('excluye dispositivos, nombres incompletos, Adipa y duplicados', async () => {
    const buffer = await makeXlsx([
      ['Nombre'],
      ['Juan Pérez'],
      ['María González'],
      ['iPhone'],
      ['Nicole'],
      ['Soporte ADIPA'],
      ['Pedro Soto'],
      ['Pedro Soto'],
      ['Android de Daniel Oyarce'],
    ]);

    const { participants } = await parseParticipantsFile(buffer, 'lista.xlsx');
    const evaluated = evaluateParticipants(
      participants.map((p) => ({ displayName: p.displayName, email: p.email })),
    );

    expect(evaluated.totalFound).toBe(8);
    expect(evaluated.totalEligible).toBe(3); // Juan, María y Daniel Oyarce
    expect(evaluated.byReason.DEVICE_NAME).toBe(1);
    expect(evaluated.byReason.INCOMPLETE_NAME).toBe(1);
    expect(evaluated.byReason.ADIPA_NAME).toBe(1);
    expect(evaluated.byReason.DUPLICATE_NAME).toBe(2);
  });

  it('aparecer en el Excel NO garantiza participar', async () => {
    const buffer = await makeXlsx([['Nombre'], ['iPhone'], ['Android'], ['Juan']]);
    const { participants } = await parseParticipantsFile(buffer, 'lista.xlsx');
    const evaluated = evaluateParticipants(participants.map((p) => ({ displayName: p.displayName })));

    expect(evaluated.totalEligible).toBe(0);
  });

  it('usa el correo del Excel para detectar al anfitrion', async () => {
    const buffer = await makeXlsx([
      ['Nombre', 'Correo'],
      ['Carolina Muñoz', 'host@adipa.cl'],
      ['Juan Pérez', 'juan@ejemplo.com'],
    ]);

    const { participants } = await parseParticipantsFile(buffer, 'lista.xlsx');
    const evaluated = evaluateParticipants(participants, { hostEmail: 'host@adipa.cl' });

    expect(evaluated.participants[0].detectedRole).toBe('HOST');
    expect(evaluated.participants[0].eligible).toBe(false);
    expect(evaluated.participants[1].eligible).toBe(true);
  });
});

describe('volumen', () => {
  it('lee 1.000 filas', async () => {
    const rows: string[][] = [['Nombre']];
    for (let i = 0; i < 1000; i++) {
      rows.push([`Nombre${String.fromCharCode(97 + (i % 26))} Apellido${Math.floor(i / 26)}`]);
    }

    const buffer = await makeXlsx(rows);
    const result = await parseParticipantsFile(buffer, 'lista.xlsx');
    expect(result.participants).toHaveLength(1000);
  });
});
