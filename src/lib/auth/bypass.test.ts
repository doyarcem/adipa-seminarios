import { describe, expect, it } from 'vitest';
import { getPreviewIdentity, isAuthBypassEnabled, isRole } from './bypass';
import { resolveRole } from './roles';

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe('candados del modo de vista previa', () => {
  it('se activa solo con AUTH_BYPASS=true fuera de produccion', () => {
    expect(isAuthBypassEnabled(env({ AUTH_BYPASS: 'true', NODE_ENV: 'development' }))).toBe(true);
    expect(isAuthBypassEnabled(env({ AUTH_BYPASS: 'true', NODE_ENV: 'test' }))).toBe(true);
  });

  it('NUNCA se activa en produccion, aunque la variable este puesta', () => {
    expect(isAuthBypassEnabled(env({ AUTH_BYPASS: 'true', NODE_ENV: 'production' }))).toBe(false);
  });

  it('esta apagado por defecto', () => {
    expect(isAuthBypassEnabled(env({ NODE_ENV: 'development' }))).toBe(false);
    expect(isAuthBypassEnabled(env({ AUTH_BYPASS: 'false', NODE_ENV: 'development' }))).toBe(false);
  });

  it('no se activa con valores parecidos a true', () => {
    for (const value of ['TRUE', '1', 'yes', 'si', ' true ']) {
      expect(isAuthBypassEnabled(env({ AUTH_BYPASS: value, NODE_ENV: 'development' }))).toBe(false);
    }
  });
});

describe('identidades de vista previa', () => {
  it('el rol mostrado es coherente con la regla de dominio (seccion 6)', () => {
    const admin = getPreviewIdentity('ADMIN');
    const operator = getPreviewIdentity('OPERATOR');

    expect(resolveRole(admin.email, env({})).role).toBe('ADMIN');
    expect(resolveRole(operator.email, env({})).role).toBe('OPERATOR');
  });

  it('se distinguen a simple vista de un usuario real', () => {
    expect(getPreviewIdentity('ADMIN').name).toContain('vista previa');
    expect(getPreviewIdentity('OPERATOR').name).toContain('vista previa');
  });
});

describe('validacion del rol recibido', () => {
  it.each(['ADMIN', 'OPERATOR'])('acepta %s', (value) => {
    expect(isRole(value)).toBe(true);
  });

  it.each(['admin', 'SUPERADMIN', '', null, undefined, 1])('rechaza %s', (value) => {
    expect(isRole(value)).toBe(false);
  });
});
