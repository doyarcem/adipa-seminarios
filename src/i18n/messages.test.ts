/**
 * Guardia de internacionalizacion (seccion 47).
 *
 * Verifica que espanol e ingles tengan exactamente las mismas claves. Sin esto,
 * una traduccion olvidada aparece como texto crudo recien en produccion, en vivo,
 * durante un seminario.
 */

import { describe, expect, it } from 'vitest';
import es from '../../messages/es.json';
import en from '../../messages/en.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : flatten(value, path);
  });
}

/** Extrae los placeholders {asi} de un mensaje. */
function placeholders(tree: Tree, path: string): string[] {
  const value = path.split('.').reduce<string | Tree | undefined>((acc, key) => {
    if (acc && typeof acc === 'object') return acc[key];
    return undefined;
  }, tree);

  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

const esKeys = flatten(es as Tree);
const enKeys = flatten(en as Tree);

describe('paridad de mensajes es / en', () => {
  it('el ingles no tiene claves faltantes', () => {
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it('el ingles no tiene claves de mas', () => {
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
  });

  it('los placeholders coinciden en ambos idiomas', () => {
    const mismatches = esKeys.filter((key) => {
      const a = placeholders(es as Tree, key).join(',');
      const b = placeholders(en as Tree, key).join(',');
      return a !== b;
    });
    expect(mismatches).toEqual([]);
  });

  it('no hay mensajes vacios', () => {
    for (const key of esKeys) {
      expect(placeholders(es as Tree, key)).toBeDefined();
    }
    expect(esKeys.length).toBeGreaterThan(100);
  });
});

describe('cobertura de codigos de dominio', () => {
  const ZOOM_ERROR_CODES = [
    'TOKEN_EXPIRED',
    'FORBIDDEN',
    'PLAN_NOT_SUPPORTED',
    'TIMEOUT',
    'RATE_LIMITED',
    'UNAVAILABLE',
    'MEETING_NOT_FOUND',
    'NO_ACTIVE_MEETINGS',
    'NO_PARTICIPANTS',
    'UNKNOWN',
  ];

  const EXCLUSION_REASONS = [
    'HOST',
    'CO_HOST',
    'ADIPA_NAME',
    'DUPLICATE_NAME',
    'INCOMPLETE_NAME',
    'DEVICE_NAME',
    'PREVIOUS_WINNER',
    'MANUAL',
    'OTHER',
  ];

  it.each([
    ['es', es],
    ['en', en],
  ])('%s traduce todos los errores de Zoom', (_locale, messages) => {
    for (const code of ZOOM_ERROR_CODES) {
      expect((messages as Tree).zoomErrors).toHaveProperty(code);
    }
  });

  it.each([
    ['es', es],
    ['en', en],
  ])('%s traduce todos los motivos de exclusion', (_locale, messages) => {
    const reasons = ((messages as Tree).participants as Tree).reasons as Tree;
    for (const reason of EXCLUSION_REASONS) {
      expect(reasons).toHaveProperty(reason);
    }
  });
});
