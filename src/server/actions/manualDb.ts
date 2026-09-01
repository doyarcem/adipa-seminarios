'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/server/authz';
import { getStore } from '@/server/context';
import { evaluateParticipants } from '@/lib/eligibility/engine';
import { ImportError, parseParticipantsFile, type ImportErrorCode } from '@/lib/excel/import';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.xlsx', '.csv'];

export interface ManualImportResult {
  ok: boolean;
  error?: ImportErrorCode | 'FILE_TOO_LARGE' | 'MEETING_NOT_FOUND' | 'NO_FILE';
  totalFound?: number;
  totalEligible?: number;
  totalExcluded?: number;
  nameColumnHeader?: string | null;
  skippedRows?: number;
}

/**
 * Carga de BDD manual (secciones 20 y 21).
 *
 * Crea un snapshot con source = EXCEL. Los participantes pasan por EL MISMO motor
 * de elegibilidad que los de Zoom: aparecer en el archivo no da derecho a participar.
 *
 * No mezcla con datos de Zoom (seccion 56): el snapshot nuevo pasa a ser el activo
 * y el anterior queda archivado, igual que cualquier otra extraccion.
 */
export async function importManualDbAction(
  meetingId: string,
  formData: FormData,
): Promise<ManualImportResult> {
  const ctx = await requirePermission('participants.extract');
  const store = getStore();

  const meeting = await store.getMeeting(meetingId);
  if (!meeting) return { ok: false, error: 'MEETING_NOT_FOUND' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'NO_FILE' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'FILE_TOO_LARGE' };

  const lowerName = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return { ok: false, error: 'INVALID_FORMAT' };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseParticipantsFile(buffer, file.name);

    // Los ganadores previos de la reunion siguen excluidos aunque la fuente cambie.
    const previousWinnerNames = await store.listPreviousWinnerNames(meetingId);

    const evaluated = evaluateParticipants(
      parsed.participants.map((p) => ({ displayName: p.displayName, email: p.email })),
      {
        hostEmail: meeting.hostEmail,
        hostName: meeting.hostName,
        previousWinnerNames,
      },
    );

    const snapshot = await store.createSnapshot({
      meeting: {
        zoomAccountId: meeting.zoomAccountId,
        zoomAccountName: meeting.zoomAccountName,
        zoomMeetingUuid: meeting.zoomMeetingUuid,
        zoomMeetingId: meeting.zoomMeetingId,
        topic: meeting.topic,
        hostName: meeting.hostName,
        hostEmail: meeting.hostEmail,
        startTime: meeting.startTime,
      },
      source: 'EXCEL',
      sourceFileName: file.name,
      evaluated: evaluated.participants,
      actor: { userId: ctx.userId, email: ctx.email, name: ctx.name },
    });

    await store.audit({
      action: 'PARTICIPANTS_EXTRACTED',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      meetingId,
      snapshotId: snapshot.snapshot.id,
      drawId: null,
      detail: {
        source: 'EXCEL',
        fileName: file.name,
        nameColumn: parsed.nameColumnHeader,
        skippedRows: parsed.skippedRows,
        totalFound: snapshot.snapshot.totalFound,
        totalEligible: snapshot.snapshot.totalEligible,
        totalExcluded: snapshot.snapshot.totalExcluded,
        byReason: evaluated.byReason,
      },
    });

    revalidatePath(`/monitor/${meetingId}`);

    return {
      ok: true,
      totalFound: snapshot.snapshot.totalFound,
      totalEligible: snapshot.snapshot.totalEligible,
      totalExcluded: snapshot.snapshot.totalExcluded,
      nameColumnHeader: parsed.nameColumnHeader,
      skippedRows: parsed.skippedRows,
    };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.code };
    throw error;
  }
}
