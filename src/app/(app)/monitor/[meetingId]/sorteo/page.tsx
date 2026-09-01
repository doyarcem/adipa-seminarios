import { notFound, redirect } from 'next/navigation';
import { requirePageAccess } from '@/server/authz';
import { getStore } from '@/server/context';
import { normalizeCountdown, normalizeWinnerCount } from '@/lib/draw/constants';
import { DrawStage } from '@/components/draw/DrawStage';

export const dynamic = 'force-dynamic';

/** Cuantos nombres se mandan al cliente para la animacion de ruleta. */
const REEL_SAMPLE_SIZE = 60;

export default async function DrawPage({
  params,
  searchParams,
}: {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ winners?: string; countdown?: string }>;
}) {
  await requirePageAccess('draw.run');

  const { meetingId } = await params;
  const query = await searchParams;

  const store = getStore();
  const meeting = await store.getMeeting(meetingId);
  if (!meeting) notFound();

  const active = await store.getActiveSnapshot(meetingId);
  if (!active) redirect(`/monitor/${meetingId}`);

  // Mismo universo que usara el servidor al sortear (seccion 24).
  const previousWinners = new Set(await store.listPreviousWinnerNames(meetingId));
  const available = active.participants.filter(
    (p) => p.eligible && !previousWinners.has(p.normalizedName),
  );

  // Los parametros vienen de la URL: se normalizan en servidor, nunca se confia
  // en que el cliente haya mandado algo razonable (seccion 40).
  const requestedWinners = normalizeWinnerCount(Number(query.winners ?? 1), available.length || 1);
  const countdownSeconds = normalizeCountdown(Number(query.countdown ?? 5));

  // Muestra para la ruleta. Son nombres que el operador ya ve en la lista de
  // revision, asi que no se expone nada nuevo.
  const reelNames = available
    .slice(0, REEL_SAMPLE_SIZE * 3)
    .map((p) => p.displayName)
    .filter((_, i, arr) => arr.length <= REEL_SAMPLE_SIZE || i % Math.ceil(arr.length / REEL_SAMPLE_SIZE) === 0)
    .slice(0, REEL_SAMPLE_SIZE);

  return (
    <DrawStage
      meetingId={meetingId}
      topic={meeting.topic}
      requestedWinners={requestedWinners}
      countdownSeconds={countdownSeconds}
      availableCount={available.length}
      reelNames={reelNames}
    />
  );
}
