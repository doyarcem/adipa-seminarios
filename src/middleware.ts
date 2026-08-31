import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware de sesion.
 *
 * Solo hace el corte grueso: sin cookie de sesion, a /login. La autorizacion REAL
 * (que rol puede hacer que) vive en el servidor, en `requirePermission()`, porque
 * el middleware corre en el edge y no debe ser la unica barrera (seccion 40).
 */
const PUBLIC_PATHS = ['/login', '/api/auth'];

/**
 * Vista previa sin autenticacion.
 *
 * Se repite aqui la comprobacion de `src/lib/auth/bypass.ts` en vez de importarla:
 * el middleware corre en el runtime edge y no puede cargar modulos marcados como
 * `server-only`. Si se cambia una, hay que cambiar la otra.
 */
function isPreviewMode(): boolean {
  return process.env.AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
}

export function middleware(request: NextRequest) {
  if (isPreviewMode()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasSession =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token');

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sounds|brand|fonts).*)'],
};
