'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Clock, Play, Pause, CheckCircle2, Send } from 'lucide-react';

interface NextSendCountdownProps {
  targetAt: string | null | undefined;
  status?: 'ACTIVE' | 'PAUSED' | 'FINISHED' | string;
  running?: boolean;
  variant?: 'prominent' | 'compact';
  onZero?: () => void;
}

export function NextSendCountdown({
  targetAt,
  status = 'ACTIVE',
  running,
  variant = 'prominent',
  onZero,
}: NextSendCountdownProps) {
  const isRunning = running !== undefined ? running : status === 'ACTIVE';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeData = useMemo(() => {
    if (!targetAt) return null;
    const target = new Date(targetAt).getTime();
    if (Number.isNaN(target)) return null;

    const diff = Math.max(0, target - now);
    const totalSeconds = Math.floor(diff / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      totalSeconds,
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
      isZero: totalSeconds === 0,
    };
  }, [targetAt, now]);

  // Quando o contador chega a zero, dispara onZero() e continua re-disparando
  // a cada 3s enquanto next_send_at nao avancou (o worker leva alguns segundos
  // para gravar o novo valor no Redis apos processar o pump).
  useEffect(() => {
    if (!timeData?.isZero || !isRunning) return;
    if (onZero) onZero();
    const retryTimer = setInterval(() => {
      if (onZero) onZero();
    }, 3000);
    return () => clearInterval(retryTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeData?.isZero, isRunning]);

  // Compact variant (para listas ou tabelas)
  if (variant === 'compact') {
    if (status === 'PAUSED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-xs font-semibold text-amber-700">
          <Pause className="h-3 w-3" /> Campanha pausada
        </span>
      );
    }

    if (status === 'FINISHED') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-[#64748B]">
          <CheckCircle2 className="h-3 w-3" /> Campanha encerrada
        </span>
      );
    }

    if (!targetAt || !timeData) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-[#64748B]">
          <Clock className="h-3 w-3" /> Aguardando disparo
        </span>
      );
    }

    if (timeData.isZero) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-[#EEF2FF] px-2.5 py-1 text-xs font-semibold text-[#6366F1] animate-pulse">
          <Send className="h-3 w-3" /> Enviando agora...
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1 text-xs font-bold text-[#6366F1] shadow-xs">
        <Clock className="h-3.5 w-3.5" />
        <span>Próximo em</span>
        <span className="font-mono tracking-wider font-extrabold text-[#0F172A]">
          {timeData.hours}:{timeData.minutes}:{timeData.seconds}
        </span>
      </span>
    );
  }

  // Prominent variant (para a página de detalhes da campanha)
  if (status === 'PAUSED') {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/70 to-white p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100/80 text-amber-700">
            <Pause className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-700">Status do Envio</div>
            <div className="text-base font-bold text-[#0F172A]">Campanha Pausada</div>
          </div>
        </div>
        <p className="text-xs text-[#64748B] text-center sm:text-right">
          Inicie a campanha para retomar o contador e a fila de envios.
        </p>
      </div>
    );
  }

  if (status === 'FINISHED') {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-[#E6E8F0] bg-[#F8FAFC] p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-200/80 text-[#64748B]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Status do Envio</div>
            <div className="text-base font-bold text-[#0F172A]">Campanha Encerrada</div>
          </div>
        </div>
        <p className="text-xs text-[#64748B] text-center sm:text-right">
          Todos os disparos programados foram finalizados.
        </p>
      </div>
    );
  }

  const isSendingNow = timeData?.isZero ?? false;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#C7D2FE] bg-gradient-to-br from-white via-[#F8FAFC] to-[#EEF2FF] p-5 shadow-xs transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Header com ícone e label */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#6366F1] shadow-xs">
            <Clock className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#6366F1]">
                Próximo Envio
              </span>
              <span className="flex h-2 w-2 rounded-full bg-[#10B981] animate-ping" />
            </div>
            <div className="text-xs font-medium text-[#64748B]">
              {isSendingNow
                ? 'Processando disparo de mensagem...'
                : timeData
                ? 'Aguardando próximo disparo'
                : 'Aguardando agendamento na fila'}
            </div>
          </div>
        </div>

        {/* Display do Contador Segmentado */}
        {timeData && !isSendingNow ? (
          <div className="flex items-center justify-center gap-2">
            {/* Horas */}
            <div className="flex flex-col items-center">
              <div className="flex h-12 min-w-12 items-center justify-center rounded-xl border border-[#E6E8F0] bg-white px-2.5 shadow-xs">
                <span className="font-mono text-2xl font-black tracking-tight text-[#0F172A]">
                  {timeData.hours}
                </span>
              </div>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">HORAS</span>
            </div>

            <span className="mb-4 text-xl font-bold text-[#6366F1]">:</span>

            {/* Minutos */}
            <div className="flex flex-col items-center">
              <div className="flex h-12 min-w-12 items-center justify-center rounded-xl border border-[#E6E8F0] bg-white px-2.5 shadow-xs">
                <span className="font-mono text-2xl font-black tracking-tight text-[#0F172A]">
                  {timeData.minutes}
                </span>
              </div>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">MIN</span>
            </div>

            <span className="mb-4 text-xl font-bold text-[#6366F1]">:</span>

            {/* Segundos */}
            <div className="flex flex-col items-center">
              <div className="flex h-12 min-w-12 items-center justify-center rounded-xl border border-[#C7D2FE] bg-gradient-to-b from-white to-[#EEF2FF] px-2.5 shadow-xs ring-1 ring-[#6366F1]/20">
                <span className="font-mono text-2xl font-black tracking-tight text-[#6366F1]">
                  {timeData.seconds}
                </span>
              </div>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#6366F1]">SEG</span>
            </div>
          </div>
        ) : isSendingNow ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] px-4 py-2.5 text-[#6366F1]">
            <Send className="h-4 w-4 animate-bounce" />
            <span className="text-sm font-bold">Enviando agora...</span>
          </div>
        ) : (
          <div className="text-center sm:text-right">
            <span className="text-sm font-bold text-[#64748B]">— : — : —</span>
            <div className="text-[11px] text-[#94A3B8]">fila em espera</div>
          </div>
        )}
      </div>
    </div>
  );
}
