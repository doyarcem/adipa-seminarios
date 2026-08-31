import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Estos paquetes son nativos o pesados: deben resolverse en Node, no empaquetarse.
  serverExternalPackages: ['@napi-rs/canvas', 'exceljs'],
  experimental: {
    // La carga de BDD manual admite archivos Excel de tamano razonable (seccion 20).
    serverActions: { bodySizeLimit: '10mb' },
  },
};

export default withNextIntl(nextConfig);
