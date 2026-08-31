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

export function middleware(request: NextRequest) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sounds|brand).*)'],
};
