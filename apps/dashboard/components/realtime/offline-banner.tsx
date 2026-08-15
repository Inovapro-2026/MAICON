'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { realtimeClient, RealtimeStatus } from '@/lib/socket-client';

/**
 * Banner global de "modo offline": exibido quando o WebSocket cai.
 * Mostra um aviso e sugere recarregar a página caso a reconexão não volte.
 */
export function OfflineBanner() {
  const [status, setStatus] = useState<RealtimeStatus>(realtimeClient.status);
  const unavailableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [needsReload, setNeedsReload] = useState(false);

  useEffect(() => {
    const unsub = realtimeClient.onStatus((s) => {
      setStatus(s);
      if (s === 'connected') {
        setNeedsReload(false);
        if (unavailableTimer.current) {
          clearTimeout(unavailableTimer.current);
          unavailableTimer.current = null;
        }
      } else if (!unavailableTimer.current) {
        // Após 30s sem conexão, sugere recarregar manualmente.
        unavailableTimer.current = setTimeout(() => setNeedsReload(true), 30000);
      }
    });
    return () => {
      unsub();
      if (unavailableTimer.current) clearTimeout(unavailableTimer.current);
    };
  }, []);

  if (status === 'connected') return null;

  return (
    <div className="sticky top-14 z-30 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 text-xs font-medium text-amber-600 lg:px-4">
        <WifiOff className="h-3.5 w-3.5 shrink-0 animate-pulse" />
        <span className="flex-1 truncate">
          {status === 'disconnected'
            ? 'Sem conexão com o servidor. Reconectando…'
            : 'Conexão em tempo real instável. Reconectando…'}
        </span>
        {needsReload ? (
          <button
            onClick={() => window.location.reload()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-200 transition-colors hover:bg-amber-500/30"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar
          </button>
        ) : (
          <span className="hidden shrink-0 sm:inline text-amber-600/80">tentando reconexão automática…</span>
        )}
      </div>
    </div>
  );
}