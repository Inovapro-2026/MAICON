"use client";

import { RotateCcw } from "lucide-react";

import { StarField } from "./star-field";
import { VoiceOrb } from "./voice-orb";
import { AgentStatus } from "./agent-status";
import { ConversationList } from "./conversation-bubble";
import { VoiceControls } from "./voice-controls";
import { ConnectionStatus } from "./connection-status";
import { LanguageSelector } from "./language-selector";
import { MicUnsupported } from "./mic-unsupported";
import { useAgentConversation } from "./use-agent-conversation";

export function AgentTab() {
  const {
    status,
    sessionActive,
    isMuted,
    audioLevel,
    frequencyData,
    micDiagnostic,
    transcript,
    history,
    lastAssistant,
    usingBrowserVoice,
    micDisabled,
    showErrorCard,
    errorInfo,
    handlePress,
    handleRetry,
    stopSession,
    toggleMute,
    refresh,
  } = useAgentConversation();

  return (
    <div className="agent-page-viewport relative flex flex-col justify-between min-h-screen w-full">
      {/* 1. Fundo Espacial com Estrelas e Nebulosa */}
      <StarField />

      {/* 2. Conteúdo Principal */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center max-w-4xl mx-auto w-full px-4 pt-2 pb-2">
        {micDisabled && status !== "error" ? (
          <MicUnsupported
            diagnostic={micDiagnostic}
            onRetry={() => void refresh()}
          />
        ) : (
          <>
            {/* Voice Orb Neon Central */}
            <VoiceOrb
              state={status}
              audioLevel={audioLevel}
              frequencyData={frequencyData}
              onClick={() => void handlePress()}
            />

            {/* Texto de Status */}
            <AgentStatus state={status} sessionActive={sessionActive} />

            {/* Modo consulta — SOMENTE LEITURA */}
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full agent-glass-card px-3 py-1 text-[11px] font-medium text-cyan-300/90">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              JARVIS · Modo consulta (somente leitura)
            </div>

            {/* Card de Erro Específico com Orientação */}
            {showErrorCard && errorInfo && (
              <div className="mt-6 w-full max-w-sm rounded-2xl border border-red-500/30 bg-red-950/40 p-5 text-center backdrop-blur-md shadow-xl">
                <div className="text-sm font-semibold text-red-300">
                  {errorInfo.title}
                </div>
                <p className="mt-1 text-xs text-red-400">{errorInfo.message}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRetry()}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {errorInfo.actionLabel}
                  </button>
                </div>
              </div>
            )}

            {/* Fallback indicador: Voz do navegador */}
            {usingBrowserVoice && status !== "error" && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full agent-glass-card px-3 py-1 text-[11px] font-medium text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Voz do navegador (fallback)
              </div>
            )}

            {/* Controles de Voz (Microfone, Mute, Encerrar) */}
            <div className="mt-4 w-full">
              <VoiceControls
                state={status}
                sessionActive={sessionActive}
                isMuted={isMuted}
                audioLevel={audioLevel}
                onToggleMute={toggleMute}
                onToggleMic={handlePress}
                onEndCall={stopSession}
                disabled={micDisabled}
              />
            </div>
          </>
        )}
      </div>

      {/* 4. Barra Inferior com Indicadores (Status de Conexão + Idioma) */}
      <div className="relative z-10 flex items-center justify-between w-full px-4 sm:px-8 py-3 border-t border-white/5 text-xs">
        <ConnectionStatus state={status} sessionActive={sessionActive} />
        <LanguageSelector />
      </div>
    </div>
  );
}
