import { getTranslations, getLocale } from 'next-intl/server';
import { requirePermission } from '@/server/authz';
import { ExportError, generateCertificate } from '@/server/services/exports';
import { getStore } from '@/server/context';

/**
 * Descarga del comprobante JPG (seccion 34).
 *
 * Es un route handler y no una server action porque hace falta Content-Disposition
 * para que el navegador lo guarde con nombre propio.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ winnerId: string }> },
) {
  const ctx = await requirePermission('winner.validate');
  const { winnerId } = await params;

  const locale = await getLocale();
  const t = await getTranslations('certificate');

  // La variante de copy se decide en i18n, no en codigo: hoy "scholarship"
  // (lenguaje de marca), cambiar a "winner" es editar una clave.
  const variant = (t('variant') === 'winner' ? 'winner' : 'scholarship') as 'winner' | 'scholarship';

  try {
    const { buffer, fileName } = await generateCertificate(winnerId, variant, locale, {
      eyebrow: t(`${variant}.eyebrow`),
      headline: t(`${variant}.headline`),
      footer: t(`${variant}.footer`),
      dateLabel: t('dateLabel'),
    });

    await getStore().audit({
      action: 'CERTIFICATE_GENERATED',
      actorId: ctx.userId,
      actorEmail: ctx.email,
      meetingId: null,
      snapshotId: null,
      drawId: null,
      detail: { winnerId, fileName, variant },
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      return Response.json({ error: error.code }, { status: error.code === 'NOT_VALIDATED' ? 409 : 404 });
    }
    throw error;
  }
}
