/**
 * Genera los efectos de sonido del sorteo (seccion 30).
 *
 *   spin.wav   -> bed de ruleta girando, disenado para reproducirse en LOOP
 *                 mientras dura la animacion (la duracion la fija el operador).
 *   winner.wav -> revelacion del ganador: acorde ascendente + brillo.
 *
 * Sintesis propia con WAV PCM de 16 bits. Sin dependencias, sin audio de terceros,
 * sin problemas de licencia.
 *
 * Uso:  node scripts/generate-sounds.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sounds');

// ─────────────────────────── utilidades WAV ───────────────────────────

/** Empaqueta muestras en [-1, 1] como WAV PCM 16 bits mono. */
function encodeWav(samples) {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // tamano del bloque fmt
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits por muestra
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buffer;
}

const seconds = (s) => Math.floor(s * SAMPLE_RATE);

/** Generador pseudoaleatorio con semilla: el resultado es reproducible build a build. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Normaliza al pico deseado para que ningun sonido reviente el mezclador del navegador. */
function normalize(samples, peak = 0.85) {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max === 0) return samples;
  const gain = peak / max;
  return samples.map((s) => s * gain);
}

/** Rampa de entrada/salida para evitar chasquidos en el corte. */
function applyEdgeFades(samples, fadeSeconds = 0.005) {
  const fade = seconds(fadeSeconds);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    samples[i] *= g;
    samples[samples.length - 1 - i] *= g;
  }
  return samples;
}

// ─────────────────────────── ruleta ───────────────────────────

/**
 * Un "tick" de ruleta: golpe corto de ruido filtrado con un cuerpo tonal breve.
 * Es lo que produce la sensacion de rueda pasando por los topes.
 */
function renderTick(target, startSample, random, pitch) {
  const length = seconds(0.028);
  let lowpass = 0;

  for (let i = 0; i < length; i++) {
    const index = startSample + i;
    if (index >= target.length) return;

    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-t * 190);

    // Ruido filtrado paso-bajo: el "click" de madera.
    const noise = random() * 2 - 1;
    lowpass += (noise - lowpass) * 0.45;

    // Cuerpo tonal que le da altura al click.
    const body = Math.sin(2 * Math.PI * pitch * t) * 0.55;

    target[index] += (lowpass * 0.8 + body) * envelope * 0.5;
  }
}

/**
 * Bed de ruleta pensado para LOOP perfecto: la cantidad de ticks es entera y
 * el ultimo cierra justo antes del final, asi el empalme no se escucha.
 */
function renderSpin() {
  const duration = 2.0;
  const total = seconds(duration);
  const samples = new Float64Array(total);
  const random = makeRandom(20260831);

  const ticksPerSecond = 15;
  const tickCount = Math.round(duration * ticksPerSecond);
  const interval = total / tickCount;

  for (let i = 0; i < tickCount; i++) {
    // Pequena variacion de altura para que no suene mecanico ni sintetico.
    const pitch = 1650 + (i % 4) * 55;
    renderTick(samples, Math.round(i * interval), random, pitch);
  }

  // Zumbido grave de fondo: da cuerpo y sensacion de masa girando.
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    // La frecuencia describe un ciclo completo dentro del loop para que empalme.
    const wobble = Math.sin((2 * Math.PI * i) / total);
    samples[i] += Math.sin(2 * Math.PI * (78 + wobble * 5) * t) * 0.06;
  }

  return applyEdgeFades(normalize(Array.from(samples), 0.7), 0.004);
}

// ─────────────────────────── ganador ───────────────────────────

/** Nota con armonicos y decaimiento tipo campana. */
function renderNote(target, startSample, frequency, durationSeconds, amplitude) {
  const length = seconds(durationSeconds);
  const harmonics = [
    { ratio: 1, gain: 1 },
    { ratio: 2, gain: 0.42 },
    { ratio: 3, gain: 0.18 },
    { ratio: 4.2, gain: 0.09 },
  ];

  for (let i = 0; i < length; i++) {
    const index = startSample + i;
    if (index >= target.length) return;

    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.008);
    const decay = Math.exp(-t * 2.6);

    let value = 0;
    for (const h of harmonics) {
      value += Math.sin(2 * Math.PI * frequency * h.ratio * t) * h.gain;
    }

    target[index] += value * attack * decay * amplitude;
  }
}

/**
 * Revelacion del ganador: arpegio ascendente sobre acorde mayor + acorde final,
 * con una capa de brillo. Celebratorio sin sonar a maquina tragamonedas.
 */
function renderWinner() {
  const total = seconds(2.6);
  const samples = new Float64Array(total);

  // Do mayor con septima mayor y novena: alegre y luminoso, no estridente.
  const arpeggio = [523.25, 659.25, 783.99, 987.77, 1046.5];
  arpeggio.forEach((frequency, i) => {
    renderNote(samples, seconds(i * 0.085), frequency, 1.6, 0.3);
  });

  // Acorde pleno que sostiene el final.
  for (const frequency of [523.25, 659.25, 783.99, 1046.5]) {
    renderNote(samples, seconds(0.46), frequency, 2.0, 0.22);
  }

  // Capa de brillo: parciales agudos que decaen rapido.
  const random = makeRandom(97531);
  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    if (t < 0.42) continue;
    const shimmer = Math.exp(-(t - 0.42) * 3.4);
    samples[i] += (random() * 2 - 1) * shimmer * 0.018;
  }

  return applyEdgeFades(normalize(Array.from(samples), 0.9), 0.01);
}

// ─────────────────────────── salida ───────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  ['spin.wav', renderSpin()],
  ['winner.wav', renderWinner()],
];

for (const [name, samples] of outputs) {
  const wav = encodeWav(samples);
  writeFileSync(resolve(OUT_DIR, name), wav);
  console.log(`${name}  ${(wav.length / 1024).toFixed(0)} KB  ${(samples.length / SAMPLE_RATE).toFixed(2)}s`);
}
