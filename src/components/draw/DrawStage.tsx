'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { runDrawAction, type WinnerDto } from '@/server/actions/draws';
import { AdipaLogo } from '@/components/AdipaLogo';
import { useDrawSound } from './useDrawSound';
import { WinnerActions } from './WinnerActions';

interface Props {
  meetingId: string;
  topic: string;
  requestedWinners: number;
  countdownSeconds: number;
  availableCount: number;
  /** Muestra de nombres del universo, solo para la animacion. */
  reelNames: string[];
}

type Phase = 'ready' | 'countdown' | 'spinning' | 'winner' | 'error';

/** Duracion de la ruleta tras la cuenta regresiva. */
const SPIN_MS = 1800;
/** Cada cuanto cambia el nombre en la ruleta. */
const REEL_TICK_MS = 80;

export function DrawStage({
  meetingId,
  topic,
  requestedWinners,
  countdownSeconds,
  availableCount,
  reelNames,
}: Props) {
  const t = useTranslations('draw');
  const router = useRouter();
  const sound = useDrawSound();

  const [phase, setPhase] = useState<Phase>('ready');
  const [remaining, setRemaining] = useState(countdownSeconds);
  const [reelName, setReelName] = useState(reelNames[0] ?? '');
  const [winners, setWinners] = useState<WinnerDto[]>([]);
  const [drawId, setDrawId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  // El resultado llega del servidor antes de que termine la animacion.
  const resultRef = useRef<WinnerDto[] | null>(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      // Si el navegador lo bloquea, la pantalla sigue siendo utilizable.
    }
  }, []);

  /**
   * Arranca el sorteo.
   *
   * El servidor decide y persiste el resultado de INMEDIATO; la cuenta regresiva y
   * el redoble corren en paralelo. Asi la animacion nunca puede quedar sin desenlace
   * por un problema de red delante de la audiencia.
   */
  const start = useCallback(() => {
    setError(null);
    setPhase('countdown');
    setRemaining(countdownSeconds);
    sound.startSpin();

    void runDrawAction(meetingId, requestedWinners, countdownSeconds).then((result) => {
      if (result.ok && result.winners) {
        resultRef.current = result.winners;
        setDrawId(result.drawId ?? null);
      } else {
        resultRef.current = null;
        setError(result.error ?? 'UNKNOWN');
      }
    });
  }, [meetingId, requestedWinners, countdownSeconds, sound]);

  // Cuenta regresiva (seccion 28).
  useEffect(() => {
    if (phase !== 'countdown') return;

    if (remaining <= 0) {
      setPhase('spinning');
      return;
    }

    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, remaining]);

  /**
   * Todo lo que la ruleta necesita, leido por referencia.
   *
   * El efecto de la ruleta debe depender UNICAMENTE de la fase: la animacion
   * re-renderiza cada 80 ms, y si el efecto dependiera de valores que cambian en
   * cada render se reiniciaria en bucle y el temporizador que la detiene no
   * llegaria a dispararse nunca.
   */
  const liveRef = useRef({ reelNames, sound, error });
  liveRef.current = { reelNames, sound, error };

  // Ruleta (seccion 29): termina exactamente al acabar su ventana de tiempo.
  useEffect(() => {
    if (phase !== 'spinning') return;

    const reel = setInterval(() => {
      const names = liveRef.current.reelNames;
      setReelName(names[Math.floor(Math.random() * names.length)] ?? '');
    }, REEL_TICK_MS);

    const finish = setTimeout(() => {
      clearInterval(reel);
      liveRef.current.sound.stopSpin();

      if (liveRef.current.error || !resultRef.current) {
        setPhase('error');
        return;
      }

      setWinners(resultRef.current);
      setPhase('winner');
      liveRef.current.sound.playWinner();
    }, SPIN_MS);

    return () => {
      clearInterval(reel);
      clearTimeout(finish);
    };
  }, [phase]);

  // Al desmontar, el redoble no puede quedar sonando.
  useEffect(() => {
    return () => liveRef.current.sound.stopSpin();
  }, []);

  const onStage = phase !== 'ready';
  const showLargeLogo = phase === 'countdown' || phase === 'spinning';

  return (
    <div
      ref={stageRef}
      /* El gradiente de marca acompana todo el sorteo, desde la antesala hasta la
         revelacion. La pantalla ya esta compartida por Zoom antes de empezar, y
         cambiar el fondo a mitad de camino distraia de lo que importa. */
      className="adipa-gradient relative flex min-h-dvh flex-col overflow-hidden text-white"
    >
      {/* Durante la funcion el orden se invierte: el logo pasa a la esquina superior
          derecha y los controles se van a la izquierda, atenuados. Asi la marca ocupa
          el lugar de mayor peso visual justo cuando todos estan mirando. */}
      <header
        className={`relative z-20 flex items-start gap-3 px-6 py-5 ${
          showLargeLogo ? 'flex-row-reverse' : ''
        }`}
      >
        <div className="transition-all duration-500">
          <AdipaLogo
            mode="white"
            height={phase === 'winner' ? 96 : showLargeLogo ? 56 : 32}
            wordmarkClassName={phase === 'winner' ? 'text-[clamp(2.5rem,9vw,7rem)]' : undefined}
          />
        </div>

        <div className={`flex items-center gap-2 ${showLargeLogo ? 'mr-auto' : 'ml-auto'}`}>
          {!onStage && (
            <Link
              href={`/monitor/${meetingId}`}
              className="rounded-adipa-control px-3 py-1.5 text-[13px] font-semibold text-white/80 transition hover:bg-white/15"
            >
              ← Volver
            </Link>
          )}

          {/* Control de audio: silenciar y regular el volumen del redoble. */}
          <div
            className={`flex items-center gap-2 rounded-adipa-control bg-white/15 px-3 py-1.5 ring-1 ring-white/25 transition-opacity duration-500 ${
              showLargeLogo ? 'opacity-40 hover:opacity-100' : 'opacity-100'
            }`}
          >
            <button
              type="button"
              onClick={() => sound.setMuted(!sound.muted)}
              aria-label={sound.muted ? t('unmuteSound') : t('muteSound')}
              className="text-[15px] leading-none"
            >
              {sound.muted ? '🔇' : '🔊'}
            </button>

            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(sound.volume * 100)}
              onChange={(e) => {
                sound.setVolume(Number(e.target.value) / 100);
                if (sound.muted) sound.setMuted(false);
              }}
              aria-label={t('volume')}
              title={`${t('volume')}: ${Math.round(sound.volume * 100)}%`}
              className="adipa-volume h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/30"
            />

            <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-white/80">
              {sound.muted ? '—' : `${Math.round(sound.volume * 100)}%`}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className={`rounded-adipa-control px-3 py-1.5 text-[13px] font-semibold text-white/80 transition hover:bg-white/15 ${
              showLargeLogo ? 'opacity-40 hover:opacity-100' : 'opacity-100'
            }`}
          >
            {isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        {phase === 'ready' && (
          <Ready
            topic={topic}
            requestedWinners={Math.min(requestedWinners, availableCount)}
            countdownSeconds={countdownSeconds}
            onStart={start}
            labels={{
              run: t('run'),
              winners: t('winners'),
              countdown: t('countdown'),
              seconds: t('seconds'),
            }}
          />
        )}

        {phase === 'countdown' && (
          <div aria-live="polite">
            <p className="mb-4 text-[clamp(1.5rem,4vw,3rem)] font-bold leading-tight tracking-tight text-white">
              {topic}
            </p>
            <p className="adipa-countdown text-[clamp(8rem,26vw,20rem)]">{remaining}</p>
            <p className="mt-2 text-[15px] font-medium uppercase tracking-[0.2em] text-white/70">
              {t('seconds')}
            </p>
          </div>
        )}

        {phase === 'spinning' && (
          <div className="w-full max-w-4xl">
            <p className="mb-6 text-[clamp(1.5rem,4vw,3rem)] font-bold leading-tight tracking-tight text-white">
              {topic}
            </p>
            <div className="mx-auto flex h-40 items-center justify-center overflow-hidden rounded-adipa-card bg-white/15 px-8 ring-1 ring-white/25">
              <p
                key={reelName}
                className="adipa-reel-item truncate text-[clamp(1.75rem,6vw,4rem)] font-bold tracking-tight"
              >
                {reelName}
              </p>
            </div>
          </div>
        )}

        {phase === 'winner' && <WinnerReveal winners={winners} topic={topic} />}

        {phase === 'error' && (
          <div className="max-w-lg rounded-adipa-card bg-white/15 px-8 py-10 ring-1 ring-white/25">
            <p className="text-[17px] font-semibold">
              {error === 'EMPTY_POOL' ? t('notEnoughParticipants') : 'No se pudo realizar el sorteo.'}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/monitor/${meetingId}`)}
              className="mt-6 rounded-adipa-control bg-white px-5 py-2.5 text-[14px] font-semibold text-brand-primary"
            >
              Volver
            </button>
          </div>
        )}
      </main>

      {phase === 'winner' && (
        <>
          <Confetti />
          <footer className="relative z-20 px-6 pb-8">
            <WinnerActions
              meetingId={meetingId}
              drawId={drawId}
              winners={winners}
              onChanged={setWinners}
            />
          </footer>
        </>
      )}
    </div>
  );
}

/**
 * Antesala del sorteo.
 *
 * Deliberadamente NO muestra cuanta gente entra al sorteo: la pantalla ya esta
 * compartida con los asistentes, y ese numero no les aporta nada. Lo que importa
 * en ese momento es de que seminario se trata, cuantos ganadores habra y cuanto
 * falta. El conteo del universo queda en la consola del operador.
 */
function Ready({
  topic,
  requestedWinners,
  countdownSeconds,
  onStart,
  labels,
}: {
  topic: string;
  requestedWinners: number;
  countdownSeconds: number;
  onStart: () => void;
  labels: { run: string; winners: string; countdown: string; seconds: string };
}) {
  return (
    <div className="w-full max-w-4xl">
      <h1 className="text-[clamp(2rem,6vw,4.5rem)] font-bold leading-tight tracking-tight text-white">
        {topic}
      </h1>

      <dl className="mx-auto mt-12 flex max-w-lg items-start justify-center gap-12">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
            {labels.winners}
          </dt>
          <dd className="mt-1 text-[44px] font-bold leading-none tabular-nums text-white">
            {requestedWinners}
          </dd>
        </div>

        <div aria-hidden className="h-14 w-px bg-white/30" />

        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
            {labels.countdown}
          </dt>
          <dd className="mt-1 text-[44px] font-bold leading-none tabular-nums text-white">
            {countdownSeconds}
            <span className="ml-1 text-[20px] font-semibold">s</span>
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onStart}
        className="mt-14 rounded-adipa-control bg-white px-12 py-5 text-[18px] font-bold text-brand-primary transition hover:opacity-90"
      >
        {labels.run}
      </button>
    </div>
  );
}

function WinnerReveal({ winners, topic }: { winners: WinnerDto[]; topic: string }) {
  const tw = useTranslations('winner');
  const single = winners.length === 1;

  // El titular y el nombre del seminario comparten escala: la marca del seminario
  // pesa lo mismo que el anuncio.
  const headlineSize = 'text-[clamp(1rem,2.5vw,1.5rem)]';

  return (
    <div className="adipa-winner-in w-full max-w-5xl" aria-live="polite">
      <p
        className={`mb-2 font-bold uppercase tracking-[0.2em] text-white/90 ${headlineSize}`}
      >
        {single ? tw('single') : tw('plural')}
      </p>

      <p className={`mb-8 font-bold uppercase tracking-[0.2em] text-white ${headlineSize}`}>
        {topic}
      </p>

      {single ? (
        <p className="text-[clamp(2.5rem,9vw,7rem)] font-bold leading-none tracking-tight">
          {winners[0].name}
        </p>
      ) : (
        <ol className="mx-auto max-w-2xl space-y-3 text-left">
          {winners.map((winner) => (
            <li key={winner.id} className="flex items-baseline gap-4">
              <span className="w-8 shrink-0 text-right text-[clamp(1.25rem,3vw,2rem)] font-bold tabular-nums text-white/60">
                {winner.position}
              </span>
              <span className="text-[clamp(1.5rem,4vw,3rem)] font-bold leading-tight tracking-tight">
                {winner.name}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className={`mt-8 font-semibold uppercase tracking-[0.2em] text-white/90 ${headlineSize}`}>
        {tw('congrats')}
      </p>
    </div>
  );
}

/** Confeti decorativo. Puramente visual: oculto para lectores de pantalla. */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 180 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        duration: 2.4 + Math.random() * 2.6,
        size: 6 + Math.random() * 10,
        // Los rectangulos alargados y los cuadrados mezclados dan sensacion de volumen.
        ratio: Math.random() > 0.5 ? 0.4 : 1,
        color: ['#FFC728', '#FF017C', '#FFFFFF', '#DFD5FF', '#704EFD', '#CBE8FF'][i % 6],
      })),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="adipa-confetti absolute top-0 block rounded-[2px]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * p.ratio,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
