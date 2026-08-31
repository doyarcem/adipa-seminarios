/**
 * Lexicos del motor de elegibilidad.
 *
 * IMPORTANTE: esto NO es una blacklist de exclusion (seccion 14 del spec lo prohibe
 * explicitamente). Es un lexico usado para *desenvolver* nombres de dispositivo y
 * para decidir que tokens NO cuentan como nombre de persona.
 *
 *   "Android"                  -> 0 tokens de persona -> EXCLUIDO
 *   "Android de Daniel Oyarce" -> se desenvuelve      -> "Daniel Oyarce" -> ELEGIBLE
 */

/** Marcas, modelos y palabras de dispositivo/genericas que nunca son nombre de persona. */
export const DEVICE_TERMS: ReadonlySet<string> = new Set([
  // Apple
  'iphone', 'ipad', 'ipod', 'macbook', 'imac', 'mac', 'apple', 'airbook', 'macbookpro', 'macbookair',
  // Android / fabricantes
  'android', 'samsung', 'galaxy', 'huawei', 'xiaomi', 'redmi', 'poco', 'motorola', 'moto',
  'nokia', 'oppo', 'vivo', 'realme', 'oneplus', 'honor', 'zte', 'tcl', 'alcatel', 'infinix',
  'tecno', 'pixel', 'nexus', 'blackberry', 'sony', 'lg',
  // Computadores
  'pc', 'laptop', 'notebook', 'desktop', 'tablet', 'chromebook', 'surface',
  'dell', 'hp', 'lenovo', 'asus', 'acer', 'msi', 'toshiba', 'compaq', 'thinkpad',
  // Sistemas
  'windows', 'linux', 'ubuntu', 'ios', 'ipados', 'macos', 'chromeos',
  // Genericos de sala / sesion
  'zoom', 'meeting', 'meetingroom', 'room', 'sala', 'salon', 'conference', 'conferencia',
  'call', 'telefono', 'phone', 'movil', 'celular', 'smartphone', 'device', 'dispositivo',
  'equipo', 'tel', 'cel',
  // Identidades sin persona
  'user', 'usuario', 'guest', 'invitado', 'invitada', 'participante', 'participant',
  'anonimo', 'anonymous', 'admin', 'administrador', 'test', 'prueba', 'demo',
  'host', 'cohost', 'moderador', 'moderator', 'soporte', 'support',
]);

/**
 * Particulas y conectores. No cuentan como nombre por si solos, pero son legitimos
 * dentro de un nombre completo ("Juan de la Cruz", "Ana van der Berg").
 */
export const NAME_PARTICLES: ReadonlySet<string> = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'dos', 'das',
  'van', 'von', 'der', 'den', 'di', 'du', 'le', 'mc', 'mac', 'san', 'santa',
  'of', 'the', 'bin', 'al',
]);

/**
 * Separadores de contexto. "Juan Perez - Empresa" -> el nombre esta antes del separador.
 * Se prueba el segmento izquierdo primero; si no rinde un nombre valido, se evalua
 * la cadena completa.
 */
export const CONTEXT_SEPARATORS: readonly string[] = [
  ' - ', ' | ', ' / ', ' // ', ' — ', ' – ', ' :: ', ' * ',
];

/** Terminos que marcan que el string contenia un dispositivo (para elegir el motivo). */
export function containsDeviceTerm(tokens: readonly string[]): boolean {
  return tokens.some((t) => DEVICE_TERMS.has(t));
}
