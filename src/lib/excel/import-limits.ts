/**
 * Limites de la carga de BDD manual.
 *
 * Vive aparte de `import.ts` porque ese modulo es `server-only` (usa ExcelJS y
 * streams de Node) y el panel de carga es un componente de cliente que necesita
 * el mismo numero para construir su mensaje de error.
 */

/** Tope defensivo de filas. Una reunion espera 1.000 personas (seccion 22). */
export const MAX_IMPORT_ROWS = 5000;

/** Tope de tamano del archivo subido. */
export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
