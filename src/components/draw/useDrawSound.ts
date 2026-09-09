'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Audio del sorteo (seccion 30).
 *
 * POR QUE WEB AUDIO Y NO <audio loop>
 *
 * El atributo `loop` de HTMLAudioElement no empalma con precision de muestra:
 * al llegar al final el navegador reinicia el elemento, y ese reinicio introduce
 * un hueco de unos milisegundos. En un redoble continuo eso se oye como un
 * micro-corte cada dos segundos, delatando que es un archivo repetido.
 *
 * `AudioBufferSourceNode` con `loop = true` reproduce el bucle dentro del motor
 * de audio, con precision de muestra y sin hueco: el redoble suena como un unico
 * sonido continuo mientras dure la cuenta regresiva.
 *
 * Reglas que sigue respetando:
 *  - El navegador bloquea el audio hasta que hay un gesto del usuario. Como el
 *    sorteo SIEMPRE empieza con un clic, ese gesto reanuda el contexto. Si aun
 *    asi falla, se ignora en silencio: el sonido nunca es obligatorio.
 *  - El resultado jamas se comunica solo por audio; el sonido acompana, no informa.
 *  - Respeta el volumen del dispositivo, se puede regular y se puede silenciar.
 */

const VOLUME_STORAGE_KEY = 'adipa-draw-volume';
const DEFAULT_VOLUME = 0.55;

/** El redoble suena en bucle y llega a cansar: se atenua respecto de la revelacion. */
const SPIN_GAIN = 0.8;

/** Rampa corta al arrancar y parar, para que no se oiga un chasquido. */
const FADE_SECONDS = 0.04;

interface AudioEngine {
  context: AudioContext;
  master: GainNode;
  spin: AudioBuffer;
  winner: AudioBuffer;
}

export function useDrawSound() {
  const engineRef = useRef<AudioEngine | null>(null);
  const spinSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const spinGainRef = useRef<GainNode | null>(null);

  const [muted, setMuted] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);

  // El volumen efectivo se lee por referencia dentro de los callbacks, que no
  // deben recrearse cuando cambia (la pantalla de sorteo los usa como dependencia).
  const levelRef = useRef({ volume: DEFAULT_VOLUME, muted: false });
  levelRef.current = { volume, muted };

  useEffect(() => {
    // El operador suele usar el mismo equipo en cada seminario: se recuerda el
    // volumen que dejo configurado la vez anterior.
    try {
      const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      const parsed = stored === null ? Number.NaN : Number(stored);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) setVolumeState(parsed);
    } catch {
      // Ventana privada o almacenamiento bloqueado: se usa el valor por defecto.
    }
  }, []);

  /**
   * Prepara el motor de audio la primera vez que se necesita.
   *
   * Se crea aqui y no al montar porque un AudioContext creado sin gesto del
   * usuario nace suspendido en la mayoria de los navegadores.
   */
  const ensureEngine = useCallback(async (): Promise<AudioEngine | null> => {
    if (engineRef.current) {
      if (engineRef.current.context.state === 'suspended') {
        await engineRef.current.context.resume().catch(() => {});
      }
      return engineRef.current;
    }

    try {
      const context = new AudioContext();
      if (context.state === 'suspended') await context.resume();

      const master = context.createGain();
      master.gain.value = 1;
      master.connect(context.destination);

      const load = async (url: string) => {
        const response = await fetch(url);
        return context.decodeAudioData(await response.arrayBuffer());
      };

      const [spin, winner] = await Promise.all([
        load('/sounds/spin.wav'),
        load('/sounds/winner.wav'),
      ]);

      engineRef.current = { context, master, spin, winner };
      return engineRef.current;
    } catch {
      // Sin Web Audio el sorteo sigue funcionando, solo que en silencio.
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      spinSourceRef.current?.stop();
      spinSourceRef.current = null;
      void engineRef.current?.context.close().catch(() => {});
      engineRef.current = null;
    };
  }, []);

  const effectiveGain = (base: number) =>
    levelRef.current.muted ? 0 : levelRef.current.volume * base;

  const startSpin = useCallback(() => {
    void ensureEngine().then((engine) => {
      if (!engine) return;

      // Si ya habia un redoble sonando se descarta, para no superponer dos.
      spinSourceRef.current?.stop();

      const source = engine.context.createBufferSource();
      source.buffer = engine.spin;
      // Bucle dentro del motor de audio: sin hueco entre repeticiones.
      source.loop = true;

      const gain = engine.context.createGain();
      const now = engine.context.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(effectiveGain(SPIN_GAIN), now + FADE_SECONDS);

      source.connect(gain);
      gain.connect(engine.master);
      source.start();

      spinSourceRef.current = source;
      spinGainRef.current = gain;
    });
  }, [ensureEngine]);

  const stopSpin = useCallback(() => {
    const engine = engineRef.current;
    const source = spinSourceRef.current;
    const gain = spinGainRef.current;
    if (!engine || !source) return;

    // Se apaga con una rampa corta en vez de cortar en seco.
    const now = engine.context.currentTime;
    if (gain) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    }

    source.stop(now + FADE_SECONDS);
    spinSourceRef.current = null;
    spinGainRef.current = null;
  }, []);

  const playWinner = useCallback(() => {
    void ensureEngine().then((engine) => {
      if (!engine) return;

      const source = engine.context.createBufferSource();
      source.buffer = engine.winner;

      const gain = engine.context.createGain();
      gain.gain.value = effectiveGain(1);

      source.connect(gain);
      gain.connect(engine.master);
      source.start();
    });
  }, [ensureEngine]);

  /** El cambio de volumen se aplica en vivo sobre el redoble que ya esta sonando. */
  const applyLiveGain = useCallback((nextVolume: number, nextMuted: boolean) => {
    const engine = engineRef.current;
    const gain = spinGainRef.current;
    if (!engine || !gain) return;

    const now = engine.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(nextMuted ? 0 : nextVolume * SPIN_GAIN, now + 0.05);
  }, []);

  const setVolume = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(1, next));
      setVolumeState(clamped);
      applyLiveGain(clamped, levelRef.current.muted);

      try {
        window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
      } catch {
        // Sin almacenamiento, el volumen simplemente no se recuerda.
      }
    },
    [applyLiveGain],
  );

  const setMutedAndApply = useCallback(
    (next: boolean) => {
      setMuted(next);
      applyLiveGain(levelRef.current.volume, next);
    },
    [applyLiveGain],
  );

  /**
   * Se memoriza el objeto devuelto porque la pantalla de sorteo lo usa como
   * dependencia de un efecto. Sin esto, cada render devolveria un objeto nuevo,
   * el efecto se reiniciaria en bucle y el temporizador que detiene la animacion
   * no llegaria a dispararse nunca.
   */
  return useMemo(
    () => ({
      muted,
      setMuted: setMutedAndApply,
      volume,
      setVolume,
      startSpin,
      stopSpin,
      playWinner,
    }),
    [muted, setMutedAndApply, volume, setVolume, startSpin, stopSpin, playWinner],
  );
}
