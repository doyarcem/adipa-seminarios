'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Logo de ADIPA.
 *
 * DESIGN.md 4.2 prohibe redibujar el logo, trazarlo desde capturas o reconstruirlo
 * con CSS, SVG manual o formas geometricas. Por eso este componente NO dibuja nada:
 * carga el archivo oficial desde `public/brand/logos/` y, mientras ese archivo no
 * exista, muestra la palabra "Adipa" en Poppins Bold como respaldo tipografico.
 *
 * PARA ACTIVAR EL LOGO REAL: dejar los archivos oficiales con estos nombres en
 * `public/brand/logos/` y aparece solo en toda la aplicacion, sin tocar codigo.
 *
 *   adipa-logotype-full-color.svg   (sobre fondo blanco o #F3F4FF)
 *   adipa-logotype-white.svg        (sobre morado, cyan o navy de marca)
 *   adipa-isotype-full-color.svg
 *   adipa-isotype-white.svg
 *
 * La version blanca solo se permite sobre #704EFD, #2CB7FF o #091E42 (DESIGN.md 6.2);
 * sobre cualquier otro fondo corresponde el full-color dentro de caja blanca.
 */

export type LogoVariant = 'logotype' | 'isotype';
export type LogoMode = 'full-color' | 'white';

interface Props {
  variant?: LogoVariant;
  mode?: LogoMode;
  /** Alto en pixeles. El ancho lo define la proporcion del archivo original. */
  height?: number;
  /**
   * Clases de tamano para el respaldo tipografico, cuando debe escalar con el
   * viewport en vez de tener un alto fijo. Sustituye al calculo desde `height`.
   */
  wordmarkClassName?: string;
  className?: string;
}

const FILES: Record<LogoVariant, Record<LogoMode, string>> = {
  logotype: {
    'full-color': '/brand/logos/adipa-logotype-full-color.svg',
    white: '/brand/logos/adipa-logotype-white.svg',
  },
  isotype: {
    'full-color': '/brand/logos/adipa-isotype-full-color.svg',
    white: '/brand/logos/adipa-isotype-white.svg',
  },
};

export function AdipaLogo({
  variant = 'logotype',
  mode = 'full-color',
  height = 28,
  wordmarkClassName,
  className = '',
}: Props) {
  const [missing, setMissing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  /**
   * `onError` no basta.
   *
   * El HTML lo pinta el servidor, asi que la imagen suele fallar ANTES de que
   * React hidrate: para entonces el evento ya paso y el respaldo nunca aparecia,
   * dejando el icono de imagen rota. Al montar se comprueba tambien el estado
   * final de la imagen, que es lo que cubre ese caso.
   */
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, []);

  if (missing) {
    // El respaldo va en mayusculas: es un sustituto de logotipo, no texto corrido.
    // DESIGN.md admite "ADIPA" en mayusculas cuando se destaca la marca.
    return (
      <span
        className={`font-bold leading-none tracking-tight ${
          mode === 'white' ? 'text-white' : 'text-brand-primary'
        } ${wordmarkClassName ?? ''} ${className}`}
        style={wordmarkClassName ? undefined : { fontSize: height * 0.72, lineHeight: 1 }}
      >
        ADIPA
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- necesita onError para el respaldo
    <img
      ref={imgRef}
      src={FILES[variant][mode]}
      alt="Adipa"
      height={height}
      style={{ height, width: 'auto' }}
      onError={() => setMissing(true)}
      className={className}
    />
  );
}
