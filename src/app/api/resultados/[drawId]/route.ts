import { getTranslations, getLocale } from 'next-intl/server';
import { requirePermission } from '@/server/authz';
import { ExportError, generateResults } from '@/server/services/exports';
import { getStore } from '@/server/context';

/** Descarga del Excel de resultados (seccion 36). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ drawId: string }> },
) {
  const ctx = await requirePermission('results.export');
  const { drawId } = await params;

  const locale = await getLocale();
  const tr = await getTranslations('results');

  try {
    const { buffer, fileName } = await generateResults(drawId, locale, {
      sheetName: tr('sheetName'),
      position: tr('position'),
      name: tr('name'),
      result: tr('result'),
      status: tr('status'),
      validatedBy: tr('validatedBy'),
      date: tr('date'),
      time: tr('time'),
      draw: tr('draw'),
      meeting: tr('meeting'),
      summary: tr('summary'),
      winner: tr('winner'),
      participant: tr('participant'),
    });

    await getStore().audit({
      action: 'RESULTS_EXPORTED',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      meetingId: null,
      snapshotId: null,
      drawId,
      detail: { fileName },
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return Response.json({ error: error.code }, { status: 404 });
    }
    throw error;
  }
}
