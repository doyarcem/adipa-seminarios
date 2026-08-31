import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { certificateFileName, renderCertificate, type CertificateData } from './render';

const LABELS = {
  eyebrow: 'Adipa',
  headline: 'Beca otorgada a',
  footer: 'Te acompañamos en el siguiente paso de tu formación.',
  dateLabel: 'Fecha',
};

const base: CertificateData = {
  winnerName: 'Juan Pérez',
  meetingTopic: 'Seminario Psicología 2026',
  date: new Date('2026-08-31T15:42:31'),
  variant: 'scholarship',
  locale: 'es',
  labels: LABELS,
};

/** Muestras para revisar a ojo. Se escriben en un directorio ignorado por git. */
const SAMPLES_DIR = join(process.cwd(), 'tmp', 'certificados');

function writeSample(name: string, buffer: Buffer): void {
  if (!existsSync(SAMPLES_DIR)) mkdirSync(SAMPLES_DIR, { recursive: true });
  writeFileSync(join(SAMPLES_DIR, name), buffer);
}

describe('seccion 34 - comprobante JPG', () => {
  it('produce un JPEG valido de 1600x900', () => {
    const buffer = renderCertificate(base);

    // Magic bytes de JPEG: FF D8 al inicio, FF D9 al final.
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
    expect(buffer[buffer.length - 2]).toBe(0xff);
    expect(buffer[buffer.length - 1]).toBe(0xd9);

    // Dimensiones leidas del marcador SOF0/SOF2.
    const { width, height } = readJpegSize(buffer);
    expect(width).toBe(1600);
    expect(height).toBe(900);

    writeSample('nombre-corto.jpg', buffer);
  });

  it('es determinista: el mismo ganador produce el mismo archivo', () => {
    const a = renderCertificate(base);
    const b = renderCertificate(base);
    expect(a.equals(b)).toBe(true);
  });

  it('pesa lo razonable para compartir', () => {
    const buffer = renderCertificate(base);
    expect(buffer.length).toBeGreaterThan(20_000);
    expect(buffer.length).toBeLessThan(1_500_000);
  });

  it('acomoda nombres largos sin desbordar', () => {
    const buffer = renderCertificate({
      ...base,
      winnerName: 'María Fernanda Valenzuela Contreras',
      meetingTopic: 'Seminario Educación y Neurodesarrollo 2026: entornos inclusivos',
    });
    expect(readJpegSize(buffer)).toEqual({ width: 1600, height: 900 });
    writeSample('nombre-largo.jpg', buffer);
  });

  it('soporta la variante con el copy del prompt maestro', () => {
    const buffer = renderCertificate({
      ...base,
      variant: 'winner',
      labels: {
        eyebrow: 'Adipa',
        headline: '¡Tenemos ganador!',
        footer: '¡Felicitaciones!',
        dateLabel: 'Fecha',
      },
    });
    expect(readJpegSize(buffer)).toEqual({ width: 1600, height: 900 });
    writeSample('variante-ganador.jpg', buffer);
  });

  it('funciona en ingles', () => {
    const buffer = renderCertificate({
      ...base,
      locale: 'en',
      labels: {
        eyebrow: 'Adipa',
        headline: 'Scholarship awarded to',
        footer: 'We are with you on the next step of your training.',
        dateLabel: 'Date',
      },
    });
    expect(readJpegSize(buffer)).toEqual({ width: 1600, height: 900 });
    writeSample('ingles.jpg', buffer);
  });
});

describe('nombre de archivo', () => {
  it('quita tildes, espacios y caracteres raros', () => {
    expect(certificateFileName('María Fernández', 'Seminario Psicología 2026')).toBe(
      'comprobante-maria-fernandez-seminario-psicologia-2026.jpg',
    );
  });

  it('sobrevive a nombres con emojis y dispositivos', () => {
    const name = certificateFileName('😀 Juan Ramírez', 'Sesión / especial');
    expect(name).toMatch(/^comprobante-[a-z0-9-]+\.jpg$/);
    expect(name).toContain('juan-ramirez');
  });
});

/** Lee ancho y alto del primer marcador SOF de un JPEG. */
function readJpegSize(buffer: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0..SOF3 y SOF5..SOF15, excluyendo DHT (C4), JPG (C8) y DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  throw new Error('No se encontro el marcador SOF del JPEG.');
}
