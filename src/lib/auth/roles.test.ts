import { describe, expect, it } from 'vitest';
import { canSignIn, extractDomain, getAdminDomains, hasPermission, resolveRole } from './roles';

const env = {} as unknown as NodeJS.ProcessEnv;

describe('seccion 6 - dominios ADIPA dan rol ADMINISTRADOR', () => {
  it.each(['persona@adipa.cl', 'persona@adipa.co', 'persona@adipa.mx'])('%s es ADMIN', (email) => {
    expect(resolveRole(email, env).role).toBe('ADMIN');
  });

  it('el rol por dominio queda bloqueado y no se puede degradar', () => {
    expect(resolveRole('jefa@adipa.cl', env).lockedByDomain).toBe(true);
  });

  it('es insensible a mayusculas y espacios', () => {
    expect(resolveRole('  Persona@ADIPA.CL  ', env).role).toBe('ADMIN');
  });

  it('las cuentas de sala son OPERADOR', () => {
    expect(resolveRole('sala1.virtualys@gmail.com', env).role).toBe('OPERATOR');
    expect(resolveRole('sala12.adipa@gmail.com', env).role).toBe('OPERATOR');
    expect(resolveRole('sala12.adipa@gmail.com', env).lockedByDomain).toBe(false);
  });
});

describe('el dominio no se puede falsificar', () => {
  it.each([
    'atacante@notadipa.cl',
    'atacante@adipa.cl.evil.com',
    'atacante@sub.adipa.cl',
    'atacante@adipa.com',
    'atacante@xadipa.cl',
  ])('%s NO es ADMIN', (email) => {
    expect(resolveRole(email, env).role).toBe('OPERATOR');
  });

  it('un email con varios @ se resuelve por el ultimo', () => {
    expect(extractDomain('"a@adipa.cl"@gmail.com')).toBe('gmail.com');
    expect(resolveRole('"a@adipa.cl"@gmail.com', env).role).toBe('OPERATOR');
  });

  it.each(['', 'sinarroba', '@adipa.cl', 'persona@', 'persona@adipa', 'persona@ adipa.cl'])(
    'rechaza el email invalido %s',
    (email) => {
      expect(extractDomain(email)).toBeNull();
      expect(resolveRole(email, env).role).toBe('OPERATOR');
    },
  );
});

describe('dominios configurables', () => {
  it('usa los tres oficiales por defecto', () => {
    expect(getAdminDomains(env)).toEqual(['adipa.cl', 'adipa.co', 'adipa.mx']);
  });

  it('acepta configuracion por entorno y normaliza el formato', () => {
    const custom = { ADIPA_ADMIN_DOMAINS: '@adipa.pe, ADIPA.AR ' } as unknown as NodeJS.ProcessEnv;
    expect(getAdminDomains(custom)).toEqual(['adipa.pe', 'adipa.ar']);
    expect(resolveRole('x@adipa.pe', custom).role).toBe('ADMIN');
    expect(resolveRole('x@adipa.cl', custom).role).toBe('OPERATOR');
  });
});

describe('control de acceso a la aplicacion', () => {
  const operadores = ['sala1.virtualys@gmail.com', 'sala2.virtualys@gmail.com'];

  it('un dominio ADIPA siempre puede entrar', () => {
    expect(canSignIn('nueva@adipa.cl', [], env)).toBe(true);
  });

  it('un operador registrado puede entrar', () => {
    expect(canSignIn('SALA1.virtualys@Gmail.com', operadores, env)).toBe(true);
  });

  it('un gmail cualquiera NO puede entrar', () => {
    expect(canSignIn('desconocido@gmail.com', operadores, env)).toBe(false);
  });

  it('un email invalido no puede entrar', () => {
    expect(canSignIn('roto', operadores, env)).toBe(false);
  });
});

describe('seccion 5 - permisos por rol', () => {
  it('solo el administrador vincula y desvincula cuentas Zoom', () => {
    expect(hasPermission('ADMIN', 'zoom.link')).toBe(true);
    expect(hasPermission('OPERATOR', 'zoom.link')).toBe(false);
    expect(hasPermission('OPERATOR', 'zoom.unlink')).toBe(false);
  });

  it('el operador no administra usuarios ni configuracion global', () => {
    expect(hasPermission('OPERATOR', 'users.manage')).toBe(false);
    expect(hasPermission('OPERATOR', 'settings.manage')).toBe(false);
    expect(hasPermission('OPERATOR', 'history.viewGlobal')).toBe(false);
  });

  it('el operador puede hacer todo el flujo del sorteo', () => {
    for (const p of [
      'meetings.select',
      'participants.extract',
      'participants.override',
      'draw.run',
      'draw.alAgua',
      'winner.validate',
      'results.export',
    ] as const) {
      expect(hasPermission('OPERATOR', p)).toBe(true);
    }
  });

  it('el administrador puede todo lo del operador', () => {
    for (const p of [
      'meetings.select',
      'participants.extract',
      'draw.run',
      'winner.validate',
      'results.export',
    ] as const) {
      expect(hasPermission('ADMIN', p)).toBe(true);
    }
  });
});
