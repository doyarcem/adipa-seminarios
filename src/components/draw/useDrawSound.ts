'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Audio del sorteo (seccion 30).
 *
 * Reglas que respeta:
 *  - El navegador bloquea el autoplay hasta que hay un gesto del usuario. Como el
 *    sorteo SIEMPRE empieza con un clic del operador, ese gesto habilita el audio.
 *    Si aun asi falla, se ignora en silencio: el sonido nunca es obligatorio.
 *  - El resultado jamas se comunica solo por audio; el sonido acompana, no informa.
 *  - Respeta el volumen del dispositivo, se puede regular y se puede silenciar.
 */

const VOLUME_STORAGE_KEY = 'adipa-draw-volume';
const DEFAULT_VOLUME = 0.55;

/** El redoble suena en bucle y llega a cansar: se atenua respecto de la revelacion. */
const SPIN_GAIN = 0.8;

export function useDrawSound() {
  const spinRef = useRef<HTMLAudioElement | null>(null);
  const winnerRef = useRef<HTMLAudioElement | null>(null);

  const [muted, setMuted] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);

  useEffect(() => {
    const spin = new Audio('/sounds/spin.wav');
    spin.loop = true;

    const winner = new Audio('/sounds/winner.wav');

    spinRef.current = spin;
    winnerRef.current = winner;

    // El operador suele usar el mismo equipo en cada seminario: se recuerda el
    // volumen que dejo configurado la vez anterior.
    try {
      const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      const parsed = stored === null ? Number.NaN : Number(stored);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) setVolumeState(parsed);
    } catch {
      // Ventana privada o almacenamiento bloqueado: se usa el valor por defecto.
    }

    return () => {
      spin.pause();
      winner.pause();
      spinRef.current = null;
      winnerRef.current = null;
    };
  }, []);

  // El volumen se aplica en vivo: mover el regulador durante el redoble se oye al instante.
  useEffect(() => {
    if (spinRef.current) {
      spinRef.current.volume = volume * SPIN_GAIN;
      spinRef.current.muted = muted;
    }
    if (winnerRef.current) {
      winnerRef.current.volume = volume;
      winnerRef.current.muted = muted;
    }
  }, [volume, muted]);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    setVolumeState(clamped);
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    } catch {
      // Sin almacenamiento, el volumen simplemente no se recuerda.
    }
  }, []);

  const startSpin = useCallback(() => {
    // catch() vacio a proposito: si el navegador bloquea el audio, el sorteo sigue.
    spinRef.current?.play().catch(() => {});
  }, []);

  const stopSpin = useCallback(() => {
    const spin = spinRef.current;
    if (!spin) return;
    spin.pause();
    spin.currentTime = 0;
  }, []);

  const playWinner = useCallback(() => {
    winnerRef.current?.play().catch(() => {});
  }, []);

  /**
   * Se memoriza el objeto devuelto porque la pantalla de sorteo lo usa como
   * dependencia de un efecto. Sin esto, cada render devolveria un objeto nuevo,
   * el efecto se reiniciaria en bucle y el temporizador que detiene la animacion
   * no llegaria a dispararse nunca.
   */
  return useMemo(
    () => ({ muted, setMuted, volume, setVolume, startSpin, stopSpin, playWinner }),
    [muted, volume, setVolume, startSpin, stopSpin, playWinner],
  );
}
