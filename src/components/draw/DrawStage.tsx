'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { runDrawAction, type WinnerDto } from '@/server/actions/draws';
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
  const tw = useTranslations('winner');
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
   * la ruleta corren en paralelo. Asi la animacion nunca puede quedar sin desenlace
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
      }
      else {
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

  // Al desmontar, el audio de ruleta no puede quedar sonando.
  useEffect(() => {
    return () => liveRef.current.sound.stopSpin();
  }, []);

  const isDark = phase !== 'ready';

  return (
    <div
      ref={stageRef}
      /* El color de texto cambia de golpe, sin transicion: animarlo dejaba la
         cuenta regresiva en gris oscuro sobre el gradiente durante casi un
         segundo, justo cuando la pantalla se esta compartiendo por Zoom. */
      className={`relative flex min-h-dvh flex-col overflow-hidden ${
        isDark ? 'adipa-gradient text-white' : 'bg-brand-surface-soft text-fg-default'
      }`}
    >
      {/* Barra superior. Durante la funcion se atenua para no robar atencion. */}
      <header
        className={`relative z-20 flex items-center gap-3 px-6 py-4 transition-opacity duration-500 ${
          phase === 'countdown' || phase === 'spinning' ? 'opacity-25' : 'opacity-100'
        }`}
      >
        {phase !== 'countdown' && phase !== 'spinning' && (
          <Link
            href={`/operador/${meetingId}`}
            className={`rounded-adipa-control px-3 py-1.5 text-[13px] font-semibold transition ${
              isDark ? 'text-white/80 hover:bg-white/10' : 'text-fg-muted hover:bg-white'
            }`}
          >
            ← Volver
          </Link>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => sound.setMuted(!sound.muted)}
            aria-label={sound.muted ? t('unmuteSound') : t('muteSound')}
            className={`rounded-adipa-control px-3 py-1.5 text-[13px] font-semibold transition ${
              isDark ? 'text-white/80 hover:bg-white/10' : 'text-fg-muted hover:bg-white'
            }`}
          >
            {sound.muted ? '🔇' : '🔊'}
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className={`rounded-adipa-control px-3 py-1.5 text-[13px] font-semibold transition ${
              isDark ? 'text-white/80 hover:bg-white/10' : 'text-fg-muted hover:bg-white'
            }`}
          >
            {isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <p
          className={`mb-2 text-[11px] font-bold uppercase tracking-[0.2em] ${
            isDark ? 'text-white/70' : 'text-fg-subtle'
          }`}
        >
          {topic}
        </p>

        {phase === 'ready' && (
          <Ready
            availableCount={availableCount}
            requestedWinners={requestedWinners}
            countdownSeconds={countdownSeconds}
            onStart={start}
            labels={{
              run: t('run'),
              poolSize: t('poolSize', { count: availableCount }),
              countdown: `${countdownSeconds} ${t('seconds')}`,
              winners: t('winners'),
            }}
          />
        )}

        {phase === 'countdown' && (
          <div aria-live="polite">
            <p className="adipa-countdown text-[clamp(8rem,26vw,20rem)]">{remaining}</p>
            <p className="mt-2 text-[15px] font-medium uppercase tracking-[0.2em] text-white/70">
              {t('seconds')}
            </p>
          </div>
        )}

        {phase === 'spinning' && (
          <div className="w-full max-w-4xl">
            <div className="mx-auto flex h-40 items-center justify-center overflow-hidden rounded-adipa-card bg-white/10 px-8 ring-1 ring-white/20">
              <p
                key={reelName}
                className="adipa-reel-item truncate text-[clamp(1.75rem,6vw,4rem)] font-bold tracking-tight"
              >
                {reelName}
              </p>
            </div>
            <p className="mt-6 text-[15px] font-medium uppercase tracking-[0.2em] text-white/70">
              {t('poolSize', { count: availableCount })}
            </p>
          </div>
        )}

        {phase === 'winner' && <WinnerReveal winners={winners} />}

        {phase === 'error' && (
          <div className="max-w-lg rounded-adipa-card bg-white/10 px-8 py-10 ring-1 ring-white/20">
            <p className="text-[17px] font-semibold">
              {error === 'EMPTY_POOL' ? t('notEnoughParticipants') : 'No se pudo realizar el sorteo.'}
            </p>
            <button
              type="button"
              onClick={() => router.push(`/operador/${meetingId}`)}
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

function Ready({
  availableCount,
  requestedWinners,
  countdownSeconds,
  onStart,
  labels,
}: {
  availableCount: number;
  requestedWinners: number;
  countdownSeconds: number;
  onStart: () => void;
  labels: { run: string; poolSize: string; countdown: string; winners: string };
}) {
  return (
    <div className="w-full max-w-lg">
      <dl className="mb-10 grid grid-cols-3 gap-6 text-left">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
            Participantes
          </dt>
          <dd className="mt-1 text-[32px] font-bold tabular-nums text-brand-primary">
            {availableCount}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
            {labels.winners}
          </dt>
          <dd className="mt-1 text-[32px] font-bold tabular-nums text-fg-default">
            {Math.min(requestedWinners, availableCount)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
            Cuenta regresiva
          </dt>
          <dd className="mt-1 text-[32px] font-bold tabular-nums text-fg-default">
            {countdownSeconds}s
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onStart}
        className="adipa-gradient w-full rounded-adipa-control px-8 py-5 text-[18px] font-bold text-white transition hover:opacity-90"
      >
        {labels.run}
      </button>

      <p className="mt-4 text-[13px] text-fg-subtle">
        Activa pantalla completa antes de comenzar si vas a compartir pantalla.
      </p>
    </div>
  );
}

function WinnerReveal({ winners }: { winners: WinnerDto[] }) {
  const tw = useTranslations('winner');
  const single = winners.length === 1;

  return (
    <div className="adipa-winner-in w-full max-w-5xl" aria-live="polite">
      <p className="mb-6 text-[clamp(1rem,2.5vw,1.5rem)] font-bold uppercase tracking-[0.2em] text-white/90">
        {single ? tw('single') : tw('plural')}
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

      <p className="mt-8 text-[clamp(1rem,2.5vw,1.5rem)] font-semibold uppercase tracking-[0.2em] text-white/90">
        {tw('congrats')}
      </p>
    </div>
  );
}

/** Confeti decorativo. Puramente visual: oculto para lectores de pantalla. */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.6 + Math.random() * 2.2,
        size: 6 + Math.random() * 8,
        color: ['#FFC728', '#FF017C', '#2CB7FF', '#FFFFFF', '#DFD5FF'][i % 5],
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
            height: p.size * 0.5,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
