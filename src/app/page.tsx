import { redirect } from 'next/navigation';
import { getOptionalSession } from '@/server/authz';

/** Punto de entrada: cada rol va a su vista (seccion 5). */
export default async function HomePage() {
  const session = await getOptionalSession();
  if (!session) redirect('/login');
  redirect(session.role === 'ADMIN' ? '/admin' : '/operador');
}
