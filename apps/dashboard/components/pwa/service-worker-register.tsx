'use client';

import { useEffect } from 'react';

/**
 * Registra o Service Worker do PWA.
 * Só é registrado em produção (build otimizado) para não interferir no dev.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          // Ativa imediatamente quando houver nova versão do SW
          registration.update();
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            // Nova versão ativa — opcionalmente recarrega para usar o novo SW
            // (aqui mantemos silencioso para não interromper o operador).
          });
        })
        .catch(() => {
          // Registro falhou (ex: contexto não seguro) — app continua em modo online.
        });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }, []);

  return null;
}