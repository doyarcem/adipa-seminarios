/**
 * Candados del login de demostracion.
 *
 * Vive aparte de `src/auth.ts` porque ese modulo arrastra NextAuth entero, que no
 * se puede cargar fuera del runtime de Next. Aqui la logica es pura y testeable.
 */

/**
 * true cuando el proveedor de demostracion debe registrarse.
 *
 * Fuera de produccion basta con AUTH_DEV_MODE. En produccion hace falta un
 * SEGUNDO consentimiento explicito, porque el login de demostracion es un acceso
 * compartido: una contrasena conocida por varias personas, sin usuarios
 * individuales y sin forma de revocar a uno solo. Publicarlo significa que
 * cualquiera con la URL y esa clave entra, y que escribiendo un correo @adipa.cl
 * entra como administrador.
 *
 * El doble candado evita que AUTH_DEV_MODE llegue a produccion por descuido al
 * copiar variables de un entorno a otro.
 */
export function isDevAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.AUTH_DEV_MODE !== 'true') return false;
  if (env.NODE_ENV !== 'production') return true;
  return env.ALLOW_DEMO_LOGIN_IN_PRODUCTION === 'true';
}

/** true cuando el acceso de demostracion esta abierto en un despliegue publico. */
export function isDemoLoginExposed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' && isDevAuthEnabled(env);
}
