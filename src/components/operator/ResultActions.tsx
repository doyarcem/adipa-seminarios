'use client';

import { useState } from 'react';

/**
 * Descarga del Excel de resultados (seccion 36).
 *
 * Es un enlace normal, no fetch + blob: el navegador maneja la descarga y el
 * Content-Disposition del servidor pone el nombre del archivo.
 */
export function ResultActions({ drawId, label }: { drawId: string; label: string }) {
  const [started, setStarted] = useState(false);

  return (
    <a
      href={`/api/resultados/${drawId}`}
      onClick={() => {
        setStarted(true);
        setTimeout(() => setStarted(false), 2500);
      }}
      className="adipa-card adipa-card-interactive flex items-center justify-center px-6 py-4 text-[15px] font-semibold text-brand-primary"
    >
      {started ? 'Generando…' : label}
    </a>
  );
}
