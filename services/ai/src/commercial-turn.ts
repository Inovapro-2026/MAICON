/**
 * Turno comercial estruturado — SAVYRON.
 *
 * Estende a geração de resposta (agente) com SAÍDA ESTRUTURADA do Motor
 * Comercial: `{ reply, customer, conversation, technique_used,
 * commercial_engine_version, action }`. O backend valida e persiste de forma
 * estruturada — o JSON nunca é exibido ao cliente.
 */
import { AgentContext, AICompletionResult } from "@prospector/types";
import { createLogger } from "@prospector/logger";
import { providerManager } from "./provider-manager";
import { buildAgentMessages, AgentSystemPromptInput } from "./prompt-assembler";
import {
  buildCommercialOutputInstruction,
  COMMERCIAL_ENGINE_VERSION,
  CommercialAction,
  CommercialStageValue,
  CommercialTechnique,
  normalizeCommercialOutput,
} from "./commercial-engine";
import { extractJsonObject } from "./structured-config";
import { ChatMessage } from "./types";

const logger = createLogger("ai.commercial-turn");

export interface CommercialTurnResult {
  reply: string;
  customer: { name: string | null; segment: string | null; interest: boolean | null };
  conversation: { stage: CommercialStageValue };
  technique_used: CommercialTechnique;
  commercial_engine_version: string;
  action: CommercialAction;
  provider: AICompletionResult["provider"];
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** true se o JSON estruturado foi parseado; false = fallback de texto livre. */
  structured: boolean;
}

export interface CommercialTurnOptions {
  timeoutMs?: number;
  maxTokens?: number;
}

/** Monta as mensagens do turno comercial: system (camadas) + pedido de JSON. */
export function buildCommercialTurnMessages(
  agentConfig: AgentSystemPromptInput,
  context: AgentContext,
): ChatMessage[] {
  const messages = buildAgentMessages(agentConfig, context);
  messages.push({
    role: "user",
    content: `Mensagem mais recente do cliente: "${context.history.at(-1)?.content ?? ""}".\n\n${buildCommercialOutputInstruction()}`,
  });
  return messages;
}

/**
 * Gera um turno comercial estruturado.
 * Se o JSON não puder ser parseado, retorna fallback de texto livre
 * (structured: false) para nunca bloquear o atendimento.
 */
export async function generateCommercialTurn(
  context: AgentContext,
  options: CommercialTurnOptions & { agentConfig?: AgentSystemPromptInput } = {},
): Promise<CommercialTurnResult> {
  const messages = buildCommercialTurnMessages(options.agentConfig ?? {}, context);

  const result: AICompletionResult = await providerManager.generate(messages, {
    maxTokens: options.maxTokens ?? 600,
    timeoutMs: options.timeoutMs ?? 30000,
    temperature: 0.6,
    jsonMode: true,
  });

  try {
    const parsed = extractJsonObject(result.text);
    const normalized = normalizeCommercialOutput(parsed);
    if (!normalized.reply) {
      throw new Error("resposta vazia no JSON estruturado");
    }
    logger.info("Turno comercial estruturado gerado", {
      provider: result.provider,
      model: result.model,
      stage: normalized.stage,
      technique: normalized.technique_used,
      action: normalized.action,
      contact_type: context.contactType,
    });
    return {
      reply: normalized.reply,
      customer: normalized.customer,
      conversation: { stage: normalized.stage },
      technique_used: normalized.technique_used,
      commercial_engine_version: COMMERCIAL_ENGINE_VERSION,
      action: normalized.action,
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      structured: true,
    };
  } catch (error) {
    logger.warn("Falha ao parsear turno estruturado; usando texto livre", {
      provider: result.provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      reply: result.text,
      customer: { name: null, segment: null, interest: null },
      conversation: { stage: "NEW" },
      technique_used: "calibrated_questions",
      commercial_engine_version: COMMERCIAL_ENGINE_VERSION,
      action: "CONTINUE_CONVERSATION",
      provider: result.provider,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      structured: false,
    };
  }
}