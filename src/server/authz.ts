/**
 * Autorizacion de servidor (seccion 40).
 *
 * TODO route handler y TODA server action deben empezar llamando a una de estas
 * funciones. Es el unico lugar donde se decide si una peticion puede continuar.
 *
 * "Nunca confiar en el rol enviado por el frontend" (seccion 59) se cumple porque
 * el rol se lee del JWT firmado por el servidor, no del cuerpo de la peticion.
 */

import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission, type Permission, type Role } from '@/lib/auth/roles';
import {
  PREVIEW_ROLE_COOKIE,
  getPreviewIdentity,
  isAuthBypassEnabled,
  isRole,
} from '@/lib/auth/bypass';

export interface AuthContext {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  locale: string;
}

export class AuthorizationError extends Error {
  readonly kind: 'UNAUTHENTICATED' | 'FORBIDDEN';
  readonly status: number;

  constructor(kind: 'UNAUTHENTICATED' | 'FORBIDDEN') {
    super(kind === 'UNAUTHENTICATED' ? 'Sesion no iniciada.' : 'Permisos insuficientes.');
    this.name = 'AuthorizationError';
    this.kind = kind;
    this.status = kind === 'UNAUTHENTICATED' ? 401 : 403;
  }
}

/**
 * Sesion sintetica de vista previa, o null si el modo no esta activo.
 *
 * Se consulta ANTES que Auth.js: cuando el modo esta encendido no hay login que
 * validar. El rol se lee de una cookie para poder alternar entre las dos vistas
 * sin reiniciar el servidor.
 */
async function getPreviewSession(): Promise<AuthContext | null> {
  if (!isAuthBypassEnabled()) return null;

  const store = await cookies();
  const raw = store.get(PREVIEW_ROLE_COOKIE)?.value;
  const identity = getPreviewIdentity(isRole(raw) ? raw : 'OPERATOR');

  return {
    userId: identity.userId,
    email: identity.email,
    name: identity.name,
    role: identity.role,
    locale: 'es',
  };
}

/** Exige sesion iniciada. Lanza si no la hay. */
export async function requireSession(): Promise<AuthContext> {
  const preview = await getPreviewSession();
  if (preview) return preview;

  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new AuthorizationError('UNAUTHENTICATED');

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    role: session.user.role,
    locale: session.user.locale,
  };
}

/** Exige un permiso concreto. Es la forma preferida: expresa la intencion. */
export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await requireSession();
  if (!hasPermission(ctx.role, permission)) throw new AuthorizationError('FORBIDDEN');
  return ctx;
}

/** Exige un rol exacto. Usar solo para secciones completas (por ejemplo /admin). */
export async function requireRole(role: Role): Promise<AuthContext> {
  const ctx = await requireSession();
  if (ctx.role !== role) throw new AuthorizationError('FORBIDDEN');
  return ctx;
}

/** Variante que no lanza, para renderizar navegacion condicional. */
export async function getOptionalSession(): Promise<AuthContext | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}

/**
 * Version para PAGINAS: en vez de lanzar, redirige.
 *
 * Lanzar deja al usuario en una pantalla de error 500 con traza tecnica, que es
 * exactamente lo que prohibe la seccion 41. Un operador que abre /admin debe
 * volver a su propia vista, no ver un stack trace.
 *
 * Las server actions y los route handlers siguen usando las versiones que lanzan:
 * ahi el error se convierte en una respuesta HTTP, no en una pantalla.
 */
export async function requirePageAccess(permission: Permission): Promise<AuthContext> {
  const session = await getOptionalSession();
  if (!session) redirect('/login');

  if (!hasPermission(session.role, permission)) {
    redirect(session.role === 'ADMIN' ? '/admin' : '/monitor');
  }

  return session;
}

/** Igual que la anterior, pero exigiendo un rol exacto (secciones completas). */
export async function requirePageRole(role: Role): Promise<AuthContext> {
  const session = await getOptionalSession();
  if (!session) redirect('/login');
  if (session.role !== role) redirect(session.role === 'ADMIN' ? '/admin' : '/monitor');

  return session;
}
