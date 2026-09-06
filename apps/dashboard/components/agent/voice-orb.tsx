"use client";

import { useMemo } from "react";
import { Mic, Loader2, AlertCircle } from "lucide-react";

export type { VoiceState } from "./agent-visual-state";
import type { VoiceState } from "./agent-visual-state";

interface VoiceOrbProps {
  state: VoiceState;
  audioLevel: number; // 0.0 to 1.0
  frequencyData?: number[]; // normalized 0-1 for 7 bars
  onClick?: () => void;
}

export function VoiceOrb({
  state,
  audioLevel,
  frequencyData,
  onClick,
}: VoiceOrbProps) {
  // Escala dinâmica suave baseada no volume real
  const scale = useMemo(() => {
    if (state === "user-speaking") {
      return 1 + Math.min(audioLevel * 0.35, 0.35);
    }
    if (state === "agent-speaking") {
      return 1 + Math.min(audioLevel * 0.32, 0.32);
    }
    if (state === "processing" || state === "agent-thinking") {
      return 1.04;
    }
    if (state === "listening") {
      return 1.02;
    }
    return 1.0;
  }, [state, audioLevel]);

  // Glow intensificado de acordo com áudio e estado
  const glowShadow = useMemo(() => {
    const boost = Math.min(audioLevel * 40, 40);
    switch (state) {
      case "user-speaking":
        return `
          0 0 ${35 + boost}px rgba(56, 189, 248, 0.7),
          0 0 ${70 + boost * 1.5}px rgba(99, 102, 241, 0.55),
          0 0 ${110 + boost * 2}px rgba(168, 85, 247, 0.35),
          inset 0 0 30px rgba(15, 23, 42, 0.9)
        `;
      case "agent-speaking":
        return `
          0 0 ${40 + boost}px rgba(168, 85, 247, 0.8),
          0 0 ${80 + boost * 1.5}px rgba(236, 72, 153, 0.6),
          0 0 ${130 + boost * 2}px rgba(99, 102, 241, 0.4),
          inset 0 0 35px rgba(15, 23, 42, 0.9)
        `;
      case "processing":
      case "agent-thinking":
        return `
          0 0 45px rgba(99, 102, 241, 0.7),
          0 0 85px rgba(139, 92, 246, 0.45),
          0 0 120px rgba(56, 189, 248, 0.3),
          inset 0 0 30px rgba(15, 23, 42, 0.9)
        `;
      case "listening":
        return `
          0 0 30px rgba(99, 102, 241, 0.5),
          0 0 65px rgba(139, 92, 246, 0.35),
          0 0 100px rgba(56, 189, 248, 0.2),
          inset 0 0 30px rgba(15, 23, 42, 0.9)
        `;
      case "connecting":
        return `
          0 0 35px rgba(245, 158, 11, 0.5),
          0 0 70px rgba(99, 102, 241, 0.3),
          inset 0 0 30px rgba(15, 23, 42, 0.9)
        `;
      case "error":
        return `
          0 0 35px rgba(239, 68, 68, 0.6),
          0 0 70px rgba(220, 38, 38, 0.35),
          inset 0 0 30px rgba(15, 23, 42, 0.9)
        `;
      case "idle":
      default:
        return `
          0 0 25px rgba(99, 102, 241, 0.4),
          0 0 50px rgba(139, 92, 246, 0.25),
          inset 0 0 30px rgba(15, 23, 42, 0.85)
        `;
    }
  }, [state, audioLevel]);

  // Gradiente de borda neon
  const borderGradient = useMemo(() => {
    switch (state) {
      case "user-speaking":
        return "from-[#38BDF8] via-[#6366F1] to-[#A855F7]";
      case "agent-speaking":
        return "from-[#8B5CF6] via-[#EC4899] to-[#38BDF8]";
      case "processing":
      case "agent-thinking":
        return "from-[#6366F1] via-[#A855F7] to-[#38BDF8]";
      case "listening":
        return "from-[#38BDF8] via-[#818CF8] to-[#C084FC]";
      case "connecting":
        return "from-[#F59E0B] via-[#6366F1] to-[#8B5CF6]";
      case "error":
        return "from-[#EF4444] via-[#F87171] to-[#DC2626]";
      case "idle":
      default:
        return "from-[#6366F1] via-[#8B5CF6] to-[#A855F7]";
    }
  }, [state]);

  // Barras de waveform central (7 barras)
  const defaultBars = [0.25, 0.45, 0.75, 1.0, 0.75, 0.45, 0.25];
  const barHeights = useMemo(() => {
    if (frequencyData && frequencyData.length >= 7) {
      return frequencyData.slice(0, 7).map((v) => Math.max(0.15, Math.min(v, 1.0)));
    }
    if (state === "user-speaking" || state === "agent-speaking") {
      const mult = 0.3 + audioLevel * 0.7;
      return defaultBars.map((b) => Math.max(0.15, b * mult));
    }
    if (state === "listening") {
      return defaultBars.map((b) => b * 0.35);
    }
    return defaultBars.map((b) => b * 0.2);
  }, [state, audioLevel, frequencyData]);

  return (
    <div className="relative flex items-center justify-center">
      {/* 1. Anéis concêntricos transparentes externos */}
      <div
        className="pointer-events-none absolute h-[320px] w-[320px] rounded-full border border-[#6366F1]/20 transition-all duration-300"
        style={{
          transform: `scale(${scale * 1.08})`,
          opacity: state === "user-speaking" || state === "agent-speaking" ? 0.6 : 0.25,
        }}
      />
      <div
        className="pointer-events-none absolute h-[380px] w-[380px] rounded-full border border-[#8B5CF6]/15 transition-all duration-300"
        style={{
          transform: `scale(${scale * 1.15})`,
          opacity: state === "user-speaking" || state === "agent-speaking" ? 0.45 : 0.15,
        }}
      />
      <div
        className="pointer-events-none absolute h-[440px] w-[440px] rounded-full border border-[#38BDF8]/10 transition-all duration-300"
        style={{
          transform: `scale(${scale * 1.22})`,
          opacity: state === "user-speaking" || state === "agent-speaking" ? 0.3 : 0.08,
        }}
      />

      {/* Pulso expansivo contínuo quando ouvindo ou falando */}
      {(state === "listening" || state === "user-speaking" || state === "agent-speaking") && (
        <div
          className="pointer-events-none absolute h-[220px] w-[220px] rounded-full border-2 border-[#6366F1]/40"
          style={{
            animation: "orbRingExpand 2.8s cubic-bezier(0.1, 0.8, 0.3, 1) infinite",
          }}
        />
      )}

      {/* 2. O Orb Central Neon */}
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label="Agente de voz orb"
        className={`group relative flex h-[210px] w-[210px] sm:h-[230px] sm:w-[230px] cursor-pointer items-center justify-center rounded-full p-[3px] bg-gradient-to-tr ${borderGradient} transition-transform duration-150 ease-out hover:scale-105`}
        style={{
          transform: `scale(${scale})`,
          boxShadow: glowShadow,
        }}
      >
        {/* Núcleo escuro interno com gradiente profundo */}
        <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-b from-[#080B35] via-[#05082A] to-[#02051C] overflow-hidden">
          {/* Reflexo de luz suave no topo */}
          <div className="absolute top-2 h-20 w-36 rounded-full bg-gradient-to-b from-white/10 to-transparent blur-[8px]" />

          {/* Efeito de rotação orbital quando processando */}
          {state === "processing" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-[180px] w-[180px] rounded-full border-2 border-transparent border-t-[#38BDF8] border-r-[#A855F7] animate-spin" />
            </div>
          )}

          {/* Waveform Central ou Ícones de Estado */}
          {state === "error" ? (
            <AlertCircle className="h-14 w-14 text-[#EF4444] animate-bounce" />
          ) : state === "processing" ? (
            <div className="flex flex-col items-center justify-center gap-2 z-10">
              <Loader2 className="h-12 w-12 text-[#38BDF8] animate-spin" />
            </div>
          ) : state === "agent-thinking" ? (
            <div className="flex flex-col items-center justify-center gap-2 z-10">
              <Loader2 className="h-12 w-12 text-[#A855F7] animate-spin" />
            </div>
          ) : state === "connecting" ? (
            <Loader2 className="h-12 w-12 text-[#F59E0B] animate-spin" />
          ) : (
            <div className="relative z-10 flex h-16 items-center justify-center gap-1.5 sm:gap-2">
              {barHeights.map((h, i) => {
                const heightPx = Math.max(8, Math.round(h * 48));
                return (
                  <span
                    key={i}
                    className={`w-1.5 sm:w-2 rounded-full transition-all duration-75 ${
                      state === "agent-speaking"
                        ? "bg-gradient-to-t from-[#8B5CF6] via-[#EC4899] to-[#F43F5E]"
                        : state === "user-speaking"
                          ? "bg-gradient-to-t from-[#0284C7] via-[#38BDF8] to-[#A855F7]"
                          : state === "listening"
                            ? "bg-gradient-to-t from-[#6366F1] to-[#38BDF8]"
                            : "bg-white/40"
                    }`}
                    style={{
                      height: `${heightPx}px`,
                      boxShadow:
                        state === "user-speaking" || state === "agent-speaking"
                          ? `0 0 10px rgba(56, 189, 248, 0.6)`
                          : "none",
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
