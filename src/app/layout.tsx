import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Poppins } from 'next/font/google';
import './globals.css';

/**
 * Poppins es la tipografia oficial (DESIGN.md 11.1). Se cargan solo los pesos
 * aprobados para producto digital: hasta Bold 700. El 800 queda fuera a proposito
 * (DESIGN.md 11.2, decision de diseno 2026-08-05).
 */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'Sorteos Adipa',
  description: 'Sorteos en vivo durante seminarios y reuniones de Adipa.',
};

export const viewport: Viewport = {
  themeColor: '#704EFD',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={poppins.variable}>
      <body className="min-h-full antialiased">
        <NextIntlClientProvider messages={messages} locale={locale}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
