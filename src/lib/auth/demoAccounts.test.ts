import { describe, expect, it } from 'vitest';
import { parseDemoAccounts, verifyDemoLogin } from './demoAccounts';

// Credenciales de juguete, solo para el test. No son secretos reales.
const RAW = 'monitor.demo@gmail.com:s3creta,admin.demo@adipa.cl:0tr4Clave';

describe('parseDemoAccounts', () => {
  it('devuelve un mapa vacio si no hay variable', () => {
    expect(parseDemoAccounts(undefined).size).toBe(0);
    expect(parseDemoAccounts('').size).toBe(0);
  });

  it('parsea pares correo:contrasena separados por coma', () => {
    const accounts = parseDemoAccounts(RAW);
    expect(accounts.get('monitor.demo@gmail.com')).toBe('s3creta');
    expect(accounts.get('admin.demo@adipa.cl')).toBe('0tr4Clave');
  });

  it('acepta separacion por salto de linea y espacios sobrantes', () => {
    const accounts = parseDemoAccounts('  a@b.com:uno \n c@d.com:dos ');
    expect(accounts.get('a@b.com')).toBe('uno');
    expect(accounts.get('c@d.com')).toBe('dos');
  });

  it('normaliza el correo a minusculas', () => {
    expect(parseDemoAccounts('Monitor.Demo@Gmail.com:x').get('monitor.demo@gmail.com')).toBe('x');
  });

  it('permite ":" dentro de la contrasena (corta en el primero)', () => {
    expect(parseDemoAccounts('a@b.com:pa:ss').get('a@b.com')).toBe('pa:ss');
  });

  it('descarta entradas mal formadas', () => {
    const accounts = parseDemoAccounts('sincolon, :sincorreo, correo@sinclave:');
    expect(accounts.size).toBe(0);
  });
});

describe('verifyDemoLogin', () => {
  it('acepta correo + contrasena correctos', () => {
    expect(verifyDemoLogin(RAW, 'monitor.demo@gmail.com', 's3creta')).toBe(true);
  });

  it('es insensible a mayusculas en el correo', () => {
    expect(verifyDemoLogin(RAW, 'Monitor.Demo@GMAIL.com', 's3creta')).toBe(true);
  });

  it('rechaza contrasena incorrecta', () => {
    expect(verifyDemoLogin(RAW, 'monitor.demo@gmail.com', 'mala')).toBe(false);
  });

  it('rechaza correo no configurado', () => {
    expect(verifyDemoLogin(RAW, 'otro@gmail.com', 's3creta')).toBe(false);
  });

  it('rechaza cuando no hay cuentas configuradas', () => {
    expect(verifyDemoLogin(undefined, 'monitor.demo@gmail.com', 's3creta')).toBe(false);
  });

  it('rechaza contrasena vacia', () => {
    expect(verifyDemoLogin(RAW, 'monitor.demo@gmail.com', '')).toBe(false);
  });
});
