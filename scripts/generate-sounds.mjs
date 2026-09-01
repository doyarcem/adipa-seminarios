/**
 * Genera los efectos de sonido del sorteo (seccion 30).
 *
 *   spin.wav   -> redoble de tambores, disenado para reproducirse en LOOP
 *                 mientras dura la cuenta regresiva (la duracion la fija el operador).
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

// ─────────────────────────── redoble de tambores ───────────────────────────

/**
 * Un golpe de caja: ruido filtrado con caida rapida (el parche y las bordonas)
 * mas un cuerpo tonal grave que le da peso.
 */
function renderStroke(target, startSample, random, amplitude) {
  const length = seconds(0.035);
  let lowpass = 0;
  let highpass = 0;
  let previousNoise = 0;

  for (let i = 0; i < length; i++) {
    const index = startSample + i;
    if (index >= target.length) return;

    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-t * 145);

    const noise = random() * 2 - 1;

    // Paso-bajo: el cuerpo del parche.
    lowpass += (noise - lowpass) * 0.35;
    // Paso-alto: el siseo metalico de las bordonas.
    highpass = 0.85 * (highpass + noise - previousNoise);
    previousNoise = noise;

    // Tono grave con caida mas lenta: el aro de la caja resonando.
    const body = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 70) * 0.35;

    target[index] += (lowpass * 0.5 + highpass * 0.55 + body) * envelope * amplitude;
  }
}

/**
 * Redoble de tambores, pensado para reproducirse en LOOP mientras dura la cuenta
 * regresiva (seccion 30). La cantidad de golpes es entera y el ultimo cierra justo
 * antes del final, de modo que el empalme del loop no se escucha.
 *
 * El patron alterna manos con acento cada cuatro golpes, que es lo que hace que
 * suene a redoble militar y no a ruido continuo.
 */
function renderSpin() {
  const duration = 2.0;
  const total = seconds(duration);
  const samples = new Float64Array(total);
  const random = makeRandom(20260831);

  // Velocidad del redoble. Mas alto suena a redoble cerrado ("buzz"), mas bajo
  // deja oir cada golpe por separado y genera mas tension.
  const strokesPerSecond = 20;
  const strokeCount = Math.round(duration * strokesPerSecond);
  const interval = total / strokeCount;

  for (let i = 0; i < strokeCount; i++) {
    // Acento cada cuatro golpes y alternancia suave entre manos.
    const accent = i % 4 === 0 ? 1 : i % 2 === 0 ? 0.72 : 0.6;
    // Micro-desplazamiento humano: un redoble perfectamente cuadriculado suena a maquina.
    const jitter = (random() - 0.5) * interval * 0.12;
    renderStroke(samples, Math.round(i * interval + jitter), random, accent);
  }

  // Siseo continuo de las bordonas, muy bajo, que rellena los huecos entre golpes.
  let sizzle = 0;
  for (let i = 0; i < total; i++) {
    const noise = random() * 2 - 1;
    sizzle += (noise - sizzle) * 0.6;
    samples[i] += sizzle * 0.025;
  }

  return applyEdgeFades(normalize(Array.from(samples), 0.72), 0.004);
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
