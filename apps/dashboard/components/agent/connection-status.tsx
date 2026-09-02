"use client";

import { VoiceState } from "./voice-orb";

interface ConnectionStatusProps {
  state: VoiceState;
  sessionActive: boolean;
}

export function ConnectionStatus({ state, sessionActive }: ConnectionStatusProps) {
  const isConnected = sessionActive && state !== "error";
  const isConnecting = state === "connecting";

  return (
    <div className="flex items-center gap-2 rounded-full agent-glass-card px-3.5 py-1.5 text-xs font-medium text-[#E2E8F0] shadow-sm">
      <span className="relative flex h-2 w-2">
        {isConnected ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10B981]" />
          </>
        ) : isConnecting ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F59E0B] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F59E0B]" />
          </>
        ) : (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#64748B]" />
        )}
      </span>
      <span>
        {isConnecting
          ? "Conectando..."
          : isConnected
            ? "Conectado"
            : "Desconectado"}
      </span>
    </div>
  );
}
