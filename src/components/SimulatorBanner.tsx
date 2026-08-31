/**
 * Aviso permanente de que los datos no son reales.
 *
 * Es deliberadamente visible: el operador comparte pantalla, y confundir una
 * demo con un sorteo real seria un problema serio.
 */
export function SimulatorBanner() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-adipa-card border border-brand-yellow/60 bg-brand-yellow/10 px-4 py-3">
      <span aria-hidden className="mt-0.5 size-2 shrink-0 rounded-full bg-brand-orange" />
      <p className="text-[13px] leading-relaxed text-fg-muted">
        <strong className="font-semibold text-fg-default">Modo simulador.</strong> Las reuniones y
        los participantes son datos de prueba generados por la aplicación, no provienen de Zoom.
        Los sorteos realizados aquí no tienen validez.
      </p>
    </div>
  );
}
