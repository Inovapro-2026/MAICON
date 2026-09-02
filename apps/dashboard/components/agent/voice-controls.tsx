"use client";

import { useMemo } from "react";
import { Mic, MicOff, PhoneOff, Loader2, AudioLines } from "lucide-react";
import { VoiceState } from "./voice-orb";

interface VoiceControlsProps {
  state: VoiceState;
  sessionActive: boolean;
  isMuted: boolean;
  audioLevel: number;
  onToggleMute: () => void;
  onToggleMic: () => void;
  onEndCall: () => void;
  disabled?: boolean;
}

export function VoiceControls({
  state,
  sessionActive,
  isMuted,
  audioLevel,
  onToggleMute,
  onToggleMic,
  onEndCall,
  disabled = false,
}: VoiceControlsProps) {
  // Escala dinâmica suave das ondas do botão central
  const waveScale = useMemo(() => {
    if (!sessionActive) return 1;
    return 1 + Math.min(audioLevel * 0.4, 0.4);
  }, [sessionActive, audioLevel]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6">
      <div className="flex items-center justify-center gap-6 sm:gap-10">
        {/* Botão lateral esquerdo: Mutar / Desmutar Microfone */}
        <button
          type="button"
          onClick={onToggleMute}
          disabled={!sessionActive || disabled}
          aria-label={isMuted ? "Desmutar microfone" : "Mutar microfone"}
          title={isMuted ? "Desmutar microfone" : "Mutar microfone"}
          className={`relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full transition-all duration-200 ${
            !sessionActive
              ? "opacity-30 cursor-not-allowed bg-slate-900/40 border border-slate-700/40 text-slate-500"
              : isMuted
                ? "bg-[#EF4444]/20 border border-[#EF4444]/50 text-[#EF4444] shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:bg-[#EF4444]/30"
                : "agent-glass-button text-[#94A3B8] hover:text-white hover:border-[#818CF8]/50"
          }`}
        >
          {isMuted ? (
            <MicOff className="h-5 w-5 sm:h-6 sm:w-6" />
          ) : (
            <Mic className="h-5 w-5 sm:h-6 sm:w-6" />
          )}
        </button>

        {/* Botão central: Orb Neon do Microfone com Ondas Concêntricas */}
        <div className="relative flex items-center justify-center">
          {/* Ondas concêntricas animadas ao redor do botão */}
          {sessionActive && (
            <>
              <div
                className="pointer-events-none absolute h-24 w-24 sm:h-28 sm:w-28 rounded-full border border-[#38BDF8]/40 transition-transform duration-100"
                style={{
                  transform: `scale(${waveScale * 1.15})`,
                  opacity: 0.6,
                }}
              />
              <div
                className="pointer-events-none absolute h-32 w-32 sm:h-36 sm:w-36 rounded-full border border-[#818CF8]/30 transition-transform duration-100"
                style={{
                  transform: `scale(${waveScale * 1.3})`,
                  opacity: 0.4,
                }}
              />
              <div
                className="pointer-events-none absolute h-40 w-40 sm:h-44 sm:w-44 rounded-full border border-[#A855F7]/20 transition-transform duration-100"
                style={{
                  transform: `scale(${waveScale * 1.45})`,
                  opacity: 0.2,
                }}
              />
              <div
                className="pointer-events-none absolute h-20 w-20 rounded-full border border-[#38BDF8]"
                style={{
                  animation: "micWaveRipple 2.4s cubic-bezier(0.1, 0.8, 0.3, 1) infinite",
                }}
              />
            </>
          )}

          <button
            type="button"
            onClick={onToggleMic}
            disabled={disabled}
            aria-label={sessionActive ? "Desligar microfone" : "Ligar microfone"}
            title={sessionActive ? "Toque para desligar" : "Toque para ligar"}
            className={`group relative z-10 flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full transition-all duration-200 p-[2.5px] ${
              disabled ? "cursor-not-allowed opacity-50" : "hover:scale-105 active:scale-95 cursor-pointer"
            } ${
              state === "user-speaking"
                ? "bg-gradient-to-tr from-[#0284C7] via-[#38BDF8] to-[#A855F7] shadow-[0_0_50px_rgba(56,189,248,0.7)]"
                : state === "agent-speaking"
                  ? "bg-gradient-to-tr from-[#8B5CF6] via-[#EC4899] to-[#38BDF8] shadow-[0_0_50px_rgba(168,85,247,0.7)]"
                  : state === "processing"
                    ? "bg-gradient-to-tr from-[#6366F1] via-[#A855F7] to-[#38BDF8] shadow-[0_0_40px_rgba(99,102,241,0.6)]"
                    : sessionActive
                      ? "bg-gradient-to-tr from-[#38BDF8] via-[#818CF8] to-[#C084FC] shadow-[0_0_45px_rgba(99,102,241,0.55)]"
                      : "bg-gradient-to-tr from-[#6366F1] to-[#8B5CF6] shadow-[0_0_30px_rgba(99,102,241,0.4)]"
            }`}
          >
            {/* Núcleo escuro do botão com ícone neon */}
            <div className="flex h-full w-full items-center justify-center rounded-full bg-[#05082A] group-hover:bg-[#080B35] transition-colors">
              {state === "processing" ? (
                <Loader2 className="h-8 w-8 sm:h-9 sm:w-9 text-[#38BDF8] animate-spin" />
              ) : state === "agent-speaking" ? (
                <AudioLines className="h-8 w-8 sm:h-9 sm:w-9 text-[#EC4899] animate-pulse" />
              ) : state === "user-speaking" ? (
                <AudioLines className="h-8 w-8 sm:h-9 sm:w-9 text-[#38BDF8] animate-pulse" />
              ) : (
                <Mic
                  className={`h-8 w-8 sm:h-9 sm:w-9 transition-colors ${
                    sessionActive ? "text-[#38BDF8]" : "text-white"
                  }`}
                />
              )}
            </div>
          </button>
        </div>

        {/* Botão lateral direito: Encerrar Ligação (separado para evitar clique acidental) */}
        <button
          type="button"
          onClick={onEndCall}
          disabled={!sessionActive || disabled}
          aria-label="Encerrar chamada"
          title="Encerrar conversa com o agente"
          className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full transition-all duration-200 ${
            !sessionActive
              ? "opacity-30 cursor-not-allowed bg-slate-900/40 border border-slate-700/40 text-slate-500"
              : "bg-[#EF4444]/20 border border-[#EF4444]/50 text-[#EF4444] shadow-[0_0_25px_rgba(239,68,68,0.35)] hover:bg-[#EF4444] hover:text-white cursor-pointer"
          }`}
        >
          <PhoneOff className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      </div>

      {/* Legenda de ação rápida */}
      <span className="text-xs font-medium text-[#64748B] tracking-wide mt-1">
        {sessionActive ? "Toque para desligar" : "Toque para falar"}
      </span>
    </div>
  );
}
