"use client";

import { VoiceState } from "./voice-orb";

interface AgentStatusProps {
  state: VoiceState;
  sessionActive: boolean;
}

const STATUS_TITLES: Record<VoiceState, string> = {
  idle: "Toque para falar",
  connecting: "Conectando...",
  listening: "Ouvindo...",
  "user-speaking": "Ouvindo...",
  processing: "Processando...",
  "agent-speaking": "Falando...",
  error: "Microfone indisponível",
};

export function AgentStatus({ state, sessionActive }: AgentStatusProps) {
  const title = STATUS_TITLES[state] || "Ouvindo...";

  const titleColorClass =
    state === "agent-speaking"
      ? "neon-text-purple text-[#C084FC]"
      : state === "user-speaking"
        ? "neon-text-cyan text-[#38BDF8]"
        : state === "listening"
          ? "neon-text-blue text-[#818CF8]"
          : state === "processing"
            ? "neon-text-cyan text-[#38BDF8]"
            : state === "error"
              ? "text-[#EF4444]"
              : "text-white/90";

  return (
    <div className="mt-8 text-center px-4">
      <h2
        className={`text-2xl sm:text-3xl font-bold tracking-tight transition-colors duration-200 ${titleColorClass}`}
      >
        {title}
      </h2>
      <p className="mt-2 max-w-md mx-auto text-xs sm:text-sm text-[#94A3B8] font-normal leading-relaxed">
        {sessionActive ? (
          <>Converse à vontade — toque no microfone de novo para desligar.</>
        ) : (
          <>Toque no microfone para conversar à vontade com o seu agente de IA.</>
        )}
      </p>
    </div>
  );
}
