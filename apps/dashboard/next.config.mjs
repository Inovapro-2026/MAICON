/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/lead-import',
        destination: '/prospect?tab=import',
        permanent: false,
      },
      // Fase F: rotas órfãs da configuração antiga redirecionam para a tela
      // unificada "Empresa + IA" (substitui Meu negócio + Configurar IA).
      {
        source: '/ai/settings',
        destination: '/settings/empresa-ia',
        permanent: true,
      },
      {
        source: '/settings/business',
        destination: '/settings/empresa-ia',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
