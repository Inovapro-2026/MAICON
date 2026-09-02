/* ===========================================================================
   SAVYRON — Service Worker (PWA)
   Estratégia de cache:
   - Assets estáticos (_next/static, ícones): stale-while-revalidate
   - Navegação (páginas): network-first com fallback offline (último shell)
   - API (GET /api/proxy/**): network-first com fallback (último estado dos dados)
   =========================================================================== */
'use strict';

const CACHE_NAME = 'savyron-v6';
const STATIC_CACHE = `${CACHE_NAME}-static`;
const PAGE_CACHE = `${CACHE_NAME}-pages`;
const API_CACHE = `${CACHE_NAME}-api`;

const OFFLINE_PATH = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then(async (cache) => {
      try {
        const res = await fetch('/');
        if (res && res.ok) await cache.put('/', res.clone());
      } catch {
        /* sem rede na instalação — home entra offline */
      }
      try {
        await cache.put(OFFLINE_PATH, new Response(offlinePage(), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        }));
      } catch {
        /* cache indisponível */
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_NAME)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNavigate(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && !!req.headers.get('accept')?.includes('text/html'));
}

function isApiProxy(req) {
  const url = new URL(req.url);
  return url.pathname.startsWith('/api/proxy/') && req.method === 'GET';
}

function isStaticAsset(req) {
  const url = new URL(req.url);
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.png' ||
    url.pathname === '/logo-og.png' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  // 1) Navegação: network-first; offline -> último shell cacheado/offline
  if (isNavigate(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(req.url, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req.url);
          if (cached) return cached;
          const home = await caches.match('/');
          if (home) return home;
          return new Response(offlinePage(), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 2) API de dados: network-first com cache do último estado (modo offline)
  if (isApiProxy(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(API_CACHE).then((cache) => cache.put(req.url, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req.url)) || Response.error())
    );
    return;
  }

  // 3) Assets estáticos: stale-while-revalidate
  if (isStaticAsset(req)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req.url, copy));
            }
            return res;
          })
          .catch(() => cached || Response.error());
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4) Demais: rede simples
  event.respondWith(fetch(req));
});

/* --- Página offline estática mínima --- */
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#ffffff" />
  <title>Sem conexão · SAVYRON</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #fafafa; color: #18181b; font-family: system-ui, -apple-system, sans-serif;
      text-align: center; padding: 24px;
    }
    .box { max-width: 360px; }
    .logo { width: 64px; height: 64px; margin-bottom: 16px; display: inline-block;
      background-image: url('data:image/png;base64,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');
      background-size: contain; background-repeat: no-repeat; background-position: center; }
    h1 { font-size: 18px; margin-bottom: 8px; }
    p { font-size: 14px; line-height: 1.5; color: #52525b; }
    button {
      margin-top: 20px; border: 0; cursor: pointer;
      background: #059669; color: #fff; font-weight: 600; font-size: 14px;
      padding: 12px 22px; border-radius: 12px;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="logo"></div>
    <h1>Você está offline</h1>
    <p>O SAVYRON está exibindo os últimos dados carregados. Conecte-se à internet para voltar a receber atualizações em tempo real.</p>
    <button onclick="location.reload()">Tentar novamente</button>
  </div>
</body>
</html>`;
}