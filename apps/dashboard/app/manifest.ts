import type { MetadataRoute } from 'next';

/**
 * PWA manifest — permite instalar o app na tela inicial (Chrome/Android
 * e iOS via apple-touch-icon). Tema claro do sistema.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SAVYRON',
    short_name: 'SAVYRON',
    description: 'Plataforma de prospecção comercial automatizada do SAVYRON',
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}