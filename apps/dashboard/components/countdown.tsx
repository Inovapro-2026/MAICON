'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * Contador regressivo até o próximo envio da campanha.
 * Recebe o horário-alvo (ISO) e atualiza a cada segundo.
 * Se `targetAt` for null, mostra "—" (aguardando próximo envio).
 */
export function NextSendCountdown({ targetAt, running }: { targetAt: string | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!running) return null;

  if (!targetAt) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Clock className="h-3.5 w-3.5" />
        <span>próximo envio: —</span>
      </div>
    );
  }

  const target = new Date(targetAt).getTime();
  const diff = Math.max(0, target - now);
  const seconds = Math.floor(diff / 1000);
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const active = seconds > 0;

  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${active ? 'text-emerald-600' : 'text-zinc-500'}`}>
      <Clock className="h-3.5 w-3.5" />
      {active ? (
        <>
          <span>próximo envio em</span>
          <span className="font-mono font-semibold tabular-nums">
            {hh}:{mm}:{ss}
          </span>
        </>
      ) : (
        <span>processando…</span>
      )}
    </div>
  );
}
