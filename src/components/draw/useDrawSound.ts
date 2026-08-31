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
 *  - Respeta el volumen del dispositivo y se puede silenciar.
 */
export function useDrawSound() {
  const spinRef = useRef<HTMLAudioElement | null>(null);
  const winnerRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const spin = new Audio('/sounds/spin.wav');
    spin.loop = true;
    spin.volume = 0.45;

    const winner = new Audio('/sounds/winner.wav');
    winner.volume = 0.7;

    spinRef.current = spin;
    winnerRef.current = winner;

    return () => {
      spin.pause();
      winner.pause();
      spinRef.current = null;
      winnerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (spinRef.current) spinRef.current.muted = muted;
    if (winnerRef.current) winnerRef.current.muted = muted;
  }, [muted]);

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
   * dependencia de un efecto. Sin esto, cada render (la ruleta hace uno cada
   * 80 ms) devolveria un objeto nuevo, el efecto se reiniciaria en bucle y el
   * temporizador que detiene la animacion no llegaria a dispararse nunca.
   */
  return useMemo(
    () => ({ muted, setMuted, startSpin, stopSpin, playWinner }),
    [muted, startSpin, stopSpin, playWinner],
  );
}
