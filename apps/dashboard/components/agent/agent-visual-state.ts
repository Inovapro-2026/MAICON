import type { SavyronState } from "./savyron/types";

/**
 * Máquina de estados visual do Agente (motor real, derivado das fases HTTP/TTS/Mic).
 * Módulo puro (sem React) — coberto por testes em tests/agent-visual-state.test.mjs.
 */

/** Estados internos do agente (mesmos do VoiceOrb V1 + `agent-thinking`). */
export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "user-speaking"
  | "agent-thinking"
  | "processing"
  | "agent-speaking"
  | "error";

export const VOICE_STATES: readonly VoiceState[] = [
  "idle",
  "connecting",
  "listening",
  "user-speaking",
  "agent-thinking",
  "processing",
  "agent-speaking",
  "error",
];

/** Estados visuais compatíveis com o núcleo MAICON (SavyronCore + error). */
export const SAVYRON_STATES: readonly SavyronState[] = [
  "idle",
  "thinking",
  "listening",
  "speaking",
  "processing",
  "error",
];

export function isVoiceState(value: unknown): value is VoiceState {
  return typeof value === "string" && (VOICE_STATES as readonly string[]).includes(value);
}

export function isSavyronState(value: unknown): value is SavyronState {
  return typeof value === "string" && (SAVYRON_STATES as readonly string[]).includes(value);
}

/**
 * Mapeia o estado real do agente para o estado visual do núcleo MAICON.
 */
export function mapVoiceStateToSavyron(state: VoiceState): SavyronState {
  switch (state) {
    case "connecting":
      return "thinking";
    case "user-speaking":
      return "listening";
    case "agent-thinking":
      return "thinking";
    case "agent-speaking":
      return "speaking";
    case "processing":
      return "processing";
    case "error":
      return "error";
    case "listening":
      return "listening";
    case "idle":
    default:
      return "idle";
  }
}

/** Transições permitidas entre estados visuais (auditáveis/testáveis). */
const ALLOWED_VOICE_TRANSITIONS: Readonly<Record<VoiceState, readonly VoiceState[]>> = {
  idle: ["connecting", "error"],
  connecting: ["listening", "error", "idle"],
  listening: ["user-speaking", "agent-thinking", "processing", "error", "idle"],
  "user-speaking": ["listening", "processing", "error", "idle"],
  "agent-thinking": ["agent-speaking", "processing", "error", "idle"],
  processing: ["agent-thinking", "agent-speaking", "error", "idle"],
  "agent-speaking": ["listening", "idle", "error", "processing"],
  error: ["idle", "connecting"],
};

const ALLOWED_SAVYRON_TRANSITIONS: Readonly<Record<SavyronState, readonly SavyronState[]>> = {
  idle: ["thinking", "speaking", "listening", "processing", "error"],
  thinking: ["idle", "listening", "speaking", "processing", "error"],
  listening: ["idle", "thinking", "speaking", "processing", "error"],
  speaking: ["idle", "listening", "thinking", "processing", "error"],
  processing: ["idle", "thinking", "listening", "speaking", "error"],
  error: ["idle"],
};

/** Valida uma transição do estado interno do agente (V1/V2 compartilham). */
export function isAllowedVoiceTransition(from: VoiceState, to: VoiceState): boolean {
  return (ALLOWED_VOICE_TRANSITIONS[from] as readonly VoiceState[]).includes(to);
}

/** Valida uma transição do núcleo visual MAICON. */
export function isAllowedSavyronTransition(from: SavyronState, to: SavyronState): boolean {
  return (ALLOWED_SAVYRON_TRANSITIONS[from] as readonly SavyronState[]).includes(to);
}

/** O estado de erro não deve permitir avanço direto para fala/processamento. */
export function isErroneousTransition(from: SavyronState, to: SavyronState): boolean {
  return from === "error" && to !== "idle";
}