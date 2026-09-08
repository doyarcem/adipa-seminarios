/**
 * Configuracion de autenticacion (secciones 5, 6 y 40).
 *
 * Tres proveedores, ninguna contrasena almacenada por la aplicacion:
 *  - Zoom        -> operadores (las cuentas de sala entran con su propia cuenta Zoom)
 *  - Google      -> administradores de dominio @adipa.cl / .co / .mx
 *  - Modo prueba -> SOLO desarrollo, mientras no existan las credenciales OAuth
 *
 * REGLA CRITICA: el rol se recalcula EN SERVIDOR en cada inicio de sesion a partir
 * del email, con `resolveRole()`. Vale para los tres proveedores por igual: incluso
 * en modo prueba, escribir un correo @adipa.cl da ADMIN y un gmail da OPERADOR,
 * porque pasa por la misma funcion que produccion. No existe ninguna ruta por la
 * que el navegador pueda proponer, enviar o modificar su propio rol.
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import Zoom from 'next-auth/providers/zoom';
import type { Provider } from 'next-auth/providers';
import { canSignIn, resolveRole, type Role } from '@/lib/auth/roles';
import { verifyDemoLogin } from '@/lib/auth/demoAccounts';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
      roleLockedByDomain: boolean;
      locale: string;
    };
  }
}

/**
 * El modo prueba solo se habilita con una variable explicita y NUNCA en produccion.
 * Las dos condiciones son necesarias: si alguien despliega con AUTH_DEV_MODE=true
 * por descuido, NODE_ENV lo bloquea igual.
 */
export function isDevAuthEnabled(): boolean {
  return process.env.AUTH_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

/** Mientras no haya base de datos, los usuarios no se persisten. */
const hasDatabase = () => Boolean(process.env.DATABASE_URL?.trim());

function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  if (process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET) {
    providers.push(
      Zoom({
        clientId: process.env.ZOOM_CLIENT_ID,
        clientSecret: process.env.ZOOM_CLIENT_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  // El boton "Ingresar con Google" se retiro de la interfaz (src/app/login/LoginForm.tsx).
  // El provider se CONSERVA a proposito: mientras existan las dos cuentas que aun
  // ingresan por Google, quitarlo las dejaria fuera. Solo se registra si hay
  // credenciales configuradas; con AUTH_GOOGLE_ID/SECRET vacios no queda ninguna ruta
  // Google activa. Para cerrarlo por completo: confirmar que esas cuentas migraron al
  // login manual/Zoom y recien entonces eliminar este bloque y sus variables de entorno.
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }

  if (isDevAuthEnabled()) {
    providers.push(
      Credentials({
        id: 'dev',
        name: 'Modo prueba',
        credentials: {
          email: { label: 'Correo', type: 'email' },
          password: { label: 'Contraseña', type: 'password' },
        },
        /**
         * MODO PRUEBA: solo entran las cuentas configuradas por entorno.
         *
         * Las credenciales viven en `DEMO_LOGIN_ACCOUNTS` (solo servidor, sin prefijo
         * NEXT_PUBLIC_): nunca estan en el codigo fuente ni llegan al navegador. La
         * contrasena se compara aqui, en servidor, con tiempo constante. El rol se
         * sigue derivando del dominio del correo en `resolveRole()`, asi que basta
         * configurar un correo @adipa.cl para probar el rol administrador.
         */
        authorize: async (credentials) => {
          const email = String(credentials?.email ?? '').trim().toLowerCase();
          const password = String(credentials?.password ?? '');
          if (!email || !password) return null;

          if (!verifyDemoLogin(process.env.DEMO_LOGIN_ACCOUNTS, email, password)) return null;

          return { id: `dev:${email}`, email, name: email.split('@')[0] || email };
        },
      }),
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // JWT en vez de sesiones en base: el sorteo se opera en vivo y no conviene que
  // cada peticion dependa de un round-trip extra. Ademas permite operar sin base.
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  trustHost: true,
  providers: buildProviders(),

  callbacks: {
    /**
     * Portero de acceso. Sin esto, cualquier persona con cuenta Google entraria
     * como operador. Solo pasan los dominios ADIPA y los operadores dados de alta.
     */
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      // En modo prueba se admite cualquier correo valido: es una demo local y el
      // rol se sigue derivando del dominio, que es lo que se quiere poder probar.
      if (isDevAuthEnabled()) return true;

      if (!hasDatabase()) {
        // Sin base solo entran los dominios ADIPA: no hay donde consultar la
        // lista de operadores dados de alta.
        return canSignIn(email, []);
      }

      const { prisma } = await import('@/lib/db');
      const existing = await prisma.user.findUnique({ where: { email }, select: { active: true } });
      if (existing) return existing.active;

      const operators = await prisma.user.findMany({
        where: { role: 'OPERATOR', active: true },
        select: { email: true },
      });
      return canSignIn(
        email,
        operators.map((o) => o.email),
      );
    },

    /** El rol se resuelve aqui, en servidor, y se sella dentro del JWT firmado. */
    async jwt({ token, user }) {
      if (user?.email) {
        const email = user.email.trim().toLowerCase();
        const { role, lockedByDomain } = resolveRole(email);

        token.email = email;
        token.role = role;
        token.roleLockedByDomain = lockedByDomain;
        token.locale = 'es';
        token.userId = `u:${email}`;

        if (hasDatabase()) {
          const { prisma } = await import('@/lib/db');
          const record = await prisma.user.upsert({
            where: { email },
            update: { role, roleLockedByDomain: lockedByDomain, name: user.name ?? undefined },
            create: {
              email,
              name: user.name ?? null,
              image: user.image ?? null,
              role,
              roleLockedByDomain: lockedByDomain,
            },
            select: { id: true, role: true, roleLockedByDomain: true, locale: true, active: true },
          });

          if (!record.active) throw new Error('AccountInactive');

          token.userId = record.id;
          token.role = record.role;
          token.roleLockedByDomain = record.roleLockedByDomain;
          token.locale = record.locale;
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: (token.userId as string) ?? '',
        email: (token.email as string) ?? session.user?.email ?? '',
        role: (token.role as Role) ?? 'OPERATOR',
        roleLockedByDomain: Boolean(token.roleLockedByDomain),
        locale: (token.locale as string) ?? 'es',
      };
      return session;
    },
  },
});
