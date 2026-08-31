/**
 * Cifrado de tokens Zoom en reposo (seccion 40).
 *
 * AES-256-GCM con IV aleatorio de 12 bytes por operacion y tag de autenticacion.
 * El formato serializado es: v1.<iv-b64>.<tag-b64>.<ciphertext-b64>
 *
 * Este modulo es SOLO de servidor. Si se importa desde un componente cliente,
 * el build de Next falla, que es exactamente lo que queremos.
 */

import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ZOOM_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'Falta ZOOM_TOKEN_ENCRYPTION_KEY. Genera una con: openssl rand -base64 32',
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `ZOOM_TOKEN_ENCRYPTION_KEY debe ser de 32 bytes en base64 (recibidos ${key.length}).`,
    );
  }

  cachedKey = key;
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptSecret(serialized: string): string {
  const parts = serialized.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Token cifrado con formato invalido o version desconocida.');
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Cifra solo si hay valor. Util para campos opcionales. */
export const encryptOptional = (v: string | null | undefined): string | null =>
  v ? encryptSecret(v) : null;

export const decryptOptional = (v: string | null | undefined): string | null =>
  v ? decryptSecret(v) : null;
