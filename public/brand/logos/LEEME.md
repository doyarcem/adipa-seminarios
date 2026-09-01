# Archivos oficiales del logo ADIPA

Deja aquí los archivos oficiales con **exactamente** estos nombres y el logo
aparecerá solo en toda la aplicación (encabezado, login, pantalla de sorteo,
cuenta regresiva y revelación del ganador). No hay que tocar código.

    adipa-logotype-full-color.svg
    adipa-logotype-white.svg
    adipa-isotype-full-color.svg
    adipa-isotype-white.svg

También sirven `.png` si no hay SVG: en ese caso hay que ajustar la extensión en
`src/components/AdipaLogo.tsx`.

## Por qué no están incluidos

`DESIGN.md` §4.2 prohíbe redibujar el logo, trazarlo desde capturas o
reconstruirlo con CSS, SVG manual o formas geométricas. Mientras estos archivos
no existan, la aplicación muestra la palabra "Adipa" en Poppins Bold como
respaldo tipográfico, que es la única alternativa que no viola el manual.

## Cuándo se usa cada versión

- **full-color**: sobre fondo blanco o `#F3F4FF`
- **white**: únicamente sobre `#704EFD`, `#2CB7FF` o `#091E42` (§6.2)

Sobre cualquier otro fondo —fotografías, texturas, colores de campaña— corresponde
el full-color dentro de caja blanca (§6.3).
