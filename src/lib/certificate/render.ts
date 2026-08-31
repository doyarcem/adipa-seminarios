/**
 * Generacion del comprobante JPG (seccion 34).
 *
 * Se renderiza EN SERVIDOR, no en el navegador. El comprobante queda registrado en
 * la auditoria, asi que debe ser identico sin importar quien lo descargue: hacerlo
 * en el cliente lo dejaria a merced de las fuentes instaladas, el DPI y la version
 * del navegador de cada operador.
 *
 * Identidad visual segun DESIGN.md:
 *  - Gradiente estandar de marca #704EFD -> #2CB7FF (9.7)
 *  - Poppins, peso maximo Bold 700 (11.2)
 *  - Circulos como patron aprobado (12.2)
 *  - Sin logo: DESIGN.md 4.2 prohibe reconstruirlo y no se entregaron los archivos
 *    oficiales. Cuando existan, se insertan en el hueco marcado mas abajo.
 */

import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GlobalFonts, createCanvas, type SKRSContext2D } from '@napi-rs/canvas';

const WIDTH = 1600;
const HEIGHT = 900;
const MARGIN = 120;

const BRAND_PURPLE = '#704EFD';
const BRAND_CYAN = '#2CB7FF';

/** Familia registrada. Helvetica es el unico fallback aprobado (DESIGN.md 11.1). */
const FONT_FAMILY = 'Poppins, Helvetica, sans-serif';

let fontsReady = false;

/**
 * Registra Poppins una sola vez por proceso.
 * Los archivos estan bajo licencia SIL OFL 1.1 (ver public/fonts/OFL.txt).
 */
function ensureFonts(): void {
  if (fontsReady) return;

  // Los tres pesos se registran bajo LA MISMA familia: skia lee el peso de los
  // metadatos del archivo, asi que `600 40px Poppins` toma el SemiBold real en vez
  // de engordar el Regular por software.
  const dir = join(process.cwd(), 'public', 'fonts');
  for (const file of ['Poppins-Regular.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Bold.ttf']) {
    const path = join(dir, file);
    if (existsSync(path)) GlobalFonts.registerFromPath(path, 'Poppins');
  }

  fontsReady = true;
}

export interface CertificateData {
  winnerName: string;
  meetingTopic: string;
  date: Date;
  /** "scholarship" usa el lenguaje de marca; "winner" el del prompt maestro. */
  variant: 'scholarship' | 'winner';
  locale: string;
  labels: {
    eyebrow: string;
    headline: string;
    footer: string;
    dateLabel: string;
  };
}

/** Ajusta el tamano de fuente hasta que el texto quepa en el ancho disponible. */
function fitFontSize(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight: string,
): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

/** Parte un texto en lineas que quepan en maxWidth. */
function wrap(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function renderCertificate(data: CertificateData): Buffer {
  ensureFonts();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // ── Fondo: gradiente estandar de marca ──
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, BRAND_PURPLE);
  gradient.addColorStop(1, BRAND_CYAN);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ── Circulos decorativos (patron aprobado, con moderacion) ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.arc(WIDTH - 140, -80, 320, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(90, HEIGHT + 60, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.textBaseline = 'alphabetic';

  // ── Eyebrow de marca ──
  // HUECO PARA EL LOGO OFICIAL: cuando existan los SVG/PNG oficiales, el isotipo
  // va aqui, a la izquierda de este texto, respetando el area de seguridad X.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `700 26px ${FONT_FAMILY}`;
  ctx.letterSpacing = '6px';
  ctx.fillText(data.labels.eyebrow.toUpperCase(), MARGIN, MARGIN + 10);
  ctx.letterSpacing = '0px';

  // ── Titular ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = `600 40px ${FONT_FAMILY}`;
  ctx.fillText(data.labels.headline, MARGIN, 350);

  // ── Nombre del ganador: el elemento dominante ──
  const nameMaxWidth = WIDTH - MARGIN * 2;
  const nameSize = fitFontSize(ctx, data.winnerName, nameMaxWidth, 118, 52, '700');
  ctx.font = `700 ${nameSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = '#FFFFFF';

  const nameLines = wrap(ctx, data.winnerName, nameMaxWidth).slice(0, 2);
  let y = 350 + nameSize + 30;
  for (const line of nameLines) {
    ctx.fillText(line, MARGIN, y);
    y += nameSize * 1.1;
  }

  // ── Linea divisoria ──
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + 20);
  ctx.lineTo(MARGIN + 180, y + 20);
  ctx.stroke();

  // ── Seminario ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  const topicSize = fitFontSize(ctx, data.meetingTopic, nameMaxWidth, 38, 22, '600');
  ctx.font = `600 ${topicSize}px ${FONT_FAMILY}`;
  const topicLines = wrap(ctx, data.meetingTopic, nameMaxWidth).slice(0, 2);
  let topicY = y + 80;
  for (const line of topicLines) {
    ctx.fillText(line, MARGIN, topicY);
    topicY += topicSize * 1.3;
  }

  // ── Pie: mensaje de cierre y fecha ──
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = `400 26px ${FONT_FAMILY}`;
  ctx.fillText(data.labels.footer, MARGIN, HEIGHT - MARGIN);

  const dateText = `${data.labels.dateLabel}: ${data.date.toLocaleDateString(data.locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
  ctx.font = `400 24px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText(dateText, WIDTH - MARGIN, HEIGHT - MARGIN);
  ctx.textAlign = 'left';

  // Calidad 0.92: suficiente para proyectar y compartir sin inflar el archivo.
  return canvas.toBuffer('image/jpeg', 92);
}

/** Marcas diacriticas combinantes, para quitar tildes del nombre de archivo. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Nombre de archivo seguro y legible. */
export function certificateFileName(winnerName: string, topic: string): string {
  const slug = (value: string) =>
    value
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40);

  return `comprobante-${slug(winnerName)}-${slug(topic)}.jpg`;
}
