'use client';

import { useEffect, useState } from 'react';

const BRASILIA = 'America/Sao_Paulo';

function formatBrasilia(date: Date): { time: string; date: string } {
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRASILIA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  const dateStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRASILIA,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
  return { time, date: dateStr };
}

export function BrasiliaClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { time, date } = formatBrasilia(now);

  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <div className="font-mono text-lg font-semibold tabular-nums text-zinc-900">{time}</div>
      <div className="border-l border-zinc-200 pl-3 text-[11px] uppercase tracking-wide text-zinc-500">
        {date} <span className="text-zinc-500">· Brasília</span>
      </div>
    </div>
  );
}