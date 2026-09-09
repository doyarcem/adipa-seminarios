/**
 * Candados del login de demostracion.
 *
 * Es un acceso compartido sin usuarios individuales, asi que lo importante no es
 * solo que funcione cuando se quiere, sino que NO pueda quedar abierto por
 * descuido en un despliegue publico.
 */

import { describe, expect, it } from 'vitest';
import { isDemoLoginExposed, isDevAuthEnabled } from './demoMode';

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe('activacion fuera de produccion', () => {
  it('basta con AUTH_DEV_MODE=true', () => {
    expect(isDevAuthEnabled(env({ AUTH_DEV_MODE: 'true', NODE_ENV: 'development' }))).toBe(true);
  });

  it('sin AUTH_DEV_MODE queda apagado', () => {
    expect(isDevAuthEnabled(env({ NODE_ENV: 'development' }))).toBe(false);
    expect(isDevAuthEnabled(env({ AUTH_DEV_MODE: 'false', NODE_ENV: 'development' }))).toBe(false);
  });
});

describe('en produccion hace falta un segundo consentimiento', () => {
  it('AUTH_DEV_MODE por si solo NO abre el acceso', () => {
    expect(isDevAuthEnabled(env({ AUTH_DEV_MODE: 'true', NODE_ENV: 'production' }))).toBe(false);
  });

  it('se abre solo con la variable explicita', () => {
    expect(
      isDevAuthEnabled(
        env({
          AUTH_DEV_MODE: 'true',
          NODE_ENV: 'production',
          ALLOW_DEMO_LOGIN_IN_PRODUCTION: 'true',
        }),
      ),
    ).toBe(true);
  });

  it('la variable de produccion sola tampoco alcanza', () => {
    expect(
      isDevAuthEnabled(env({ NODE_ENV: 'production', ALLOW_DEMO_LOGIN_IN_PRODUCTION: 'true' })),
    ).toBe(false);
  });

  it('no se activa con valores parecidos a true', () => {
    for (const value of ['TRUE', '1', 'yes', 'si', ' true ']) {
      expect(
        isDevAuthEnabled(
          env({
            AUTH_DEV_MODE: 'true',
            NODE_ENV: 'production',
            ALLOW_DEMO_LOGIN_IN_PRODUCTION: value,
          }),
        ),
      ).toBe(false);
    }
  });
});

describe('aviso visible', () => {
  it('se anuncia cuando el acceso queda expuesto en produccion', () => {
    expect(
      isDemoLoginExposed(
        env({
          AUTH_DEV_MODE: 'true',
          NODE_ENV: 'production',
          ALLOW_DEMO_LOGIN_IN_PRODUCTION: 'true',
        }),
      ),
    ).toBe(true);
  });

  it('no se anuncia en desarrollo, donde no hay nada expuesto', () => {
    expect(isDemoLoginExposed(env({ AUTH_DEV_MODE: 'true', NODE_ENV: 'development' }))).toBe(false);
  });
});
