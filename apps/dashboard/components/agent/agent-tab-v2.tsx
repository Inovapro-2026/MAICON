"use client";

import { RotateCcw } from "lucide-react";

import { AgentStatus } from "./agent-status";
import { ConversationList } from "./conversation-bubble";
import { VoiceControls } from "./voice-controls";
import { ConnectionStatus } from "./connection-status";
import { LanguageSelector } from "./language-selector";
import { MicUnsupported } from "./mic-unsupported";
import { useAgentConversation } from "./use-agent-conversation";
import { mapVoiceStateToSavyron } from "./agent-visual-state";
import { SavyronAIBackground } from "./savyron";

/**
 * Agente visual V2 — núcleo holográfico MAICON dirigido pelo MOTOR REAL.
 * O fundo full-bleed (SavyronAIBackground) reage exclusivamente ao estado do
 * agente (mapVoiceStateToSavyron) e à amplitude real do microfone/TTS
 * (audioLevel). Nenhum estado, métrica ou módulo é simulado.
 */
export function AgentTabV2() {
  const {
    status,
    sessionActive,
    isMuted,
    audioLevel,
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

  const savyronState = mapVoiceStateToSavyron(status);

  // Amplitude real (microfone ou TTS) alimenta boca/olhos/anéis do núcleo sem valores artificiais em repouso
  const amplitude =
    status === "agent-speaking"
      ? audioLevel
      : status === "user-speaking" || status === "listening"
        ? Math.min(0.85, audioLevel)
        : 0;

  return (
    <SavyronAIBackground
      state={savyronState}
      audioAmplitude={amplitude}
      showStatusPill={true}
    >
      <div className="relative z-30 w-full h-[100dvh] flex flex-col items-center justify-end pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl mx-auto px-4 pb-2 flex flex-col items-center gap-2">
          <AgentStatus state={status} sessionActive={sessionActive} />

          {/* Modo consulta — SOMENTE LEITURA */}
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-full agent-glass-card px-3 py-1 text-[11px] font-medium text-cyan-300/90">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            JARVIS · Modo consulta (somente leitura)
          </div>

          {/* Fallback indicador: Voz do navegador */}
          {usingBrowserVoice && status !== "error" && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full agent-glass-card px-3 py-1 text-[11px] font-medium text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Voz do navegador (fallback)
            </div>
          )}

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

          {micDisabled && status !== "error" ? (
            <MicUnsupported
              diagnostic={micDiagnostic}
              onRetry={() => void refresh()}
            />
          ) : (
            <>
              {/* Controles de Voz (Microfone, Mute, Encerrar) */}
              <div className="mt-1 w-full">
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

          {/* Barra Inferior com Indicadores (Status de Conexão + Idioma) */}
          <div className="flex w-full items-center justify-between px-4 sm:px-8 py-2 border-t border-white/5 text-xs">
            <ConnectionStatus state={status} sessionActive={sessionActive} />
            <LanguageSelector />
          </div>
        </div>
      </div>
    </SavyronAIBackground>
  );
}
