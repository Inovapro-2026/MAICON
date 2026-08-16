/**
 * Turno comercial estruturado — SAVYRON.
 *
 * Fluxo em DUAS fases (Groq analisa, OpenRouter gera):
 * 1. ANÁLISE (Groq): decide estágio, técnica, ação e dados do cliente a partir
 *    da conversa — a análise é rápida e barata.
 * 2. RESPOSTA (OpenRouter): gera o texto que o cliente realmente verá, seguindo
 *    a análise. A resposta nunca é enviada como JSON ao cliente.
 */
import { AgentContext, AICompletionResult } from "@prospector/types";
import { createLogger } from "@prospector/logger";
import { providerManager } from "./provider-manager";
import { buildAgentMessages, AgentSystemPromptInput } from "./prompt-assembler";
import {
  buildCommercialAnalysisInstruction,
  COMMERCIAL_ENGINE_VERSION,
  CommercialAction,
  CommercialStageValue,
  CommercialTechnique,
  normalizeCommercialAnalysis,
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
  /** true se a análise estruturada foi obtida; false = análise padrão (fallback). */
  structured: boolean;
}

export interface CommercialTurnOptions {
  timeoutMs?: number;
  maxTokens?: number;
}

/**
 * Monta as mensagens da FASE 1 (análise): role curta + histórico + pedido de
 * análise JSON. Enxuta de propósito — o Groq tem TPM limitado, e a análise não
 * precisa das camadas SYSTEM (que são grandes e servem à geração da resposta).
 */
export function buildCommercialAnalysisMessages(
  agentConfig: AgentSystemPromptInput,
  context: AgentContext,
): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Você é o analisador comercial do SAVYRON. Sua única tarefa é classificar a conversa comercial em estágio, técnica e ação — você NUNCA gera respostas para o cliente.",
    },
    ...context.history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `Mensagem mais recente do cliente: "${context.history.at(-1)?.content ?? ""}".\n\n${buildCommercialAnalysisInstruction()}`,
    },
  ];
}

/** Monta as mensagens da FASE 2 (resposta): system + histórico + direção do turno. */
export function buildCommercialReplyMessages(
  agentConfig: AgentSystemPromptInput,
  context: AgentContext,
  analysis: {
    stage: CommercialStageValue;
    technique_used: CommercialTechnique;
    action: CommercialAction;
  },
): ChatMessage[] {
  const messages = buildAgentMessages(agentConfig, context);
  messages.push({
    role: "user",
    content: `Responda à mensagem mais recente do cliente. Contexto do turno: estágio=${analysis.stage}, técnica=${analysis.technique_used}, ação=${analysis.action}. Regras: 1 mensagem, no máximo 1 pergunta. Não descreva seu processo nem a análise — apenas escreva a resposta ao cliente.`,
  });
  return messages;
}

/**
 * Monta as mensagens do turno comercial para auditoria (system + histórico +
 * instrução completa do motor) — usado para registrar o prompt no AIGeneration.
 */
export function buildCommercialTurnMessages(
  agentConfig: AgentSystemPromptInput,
  context: AgentContext,
): ChatMessage[] {
  const messages = buildAgentMessages(agentConfig, context);
  messages.push({
    role: "user",
    content: `Mensagem mais recente do cliente: "${context.history.at(-1)?.content ?? ""}".\n\n${buildCommercialAnalysisInstruction()}`,
  });
  return messages;
}

/**
 * Gera um turno comercial em duas fases: análise (Groq) + resposta (OpenRouter).
 * Se a análise falhar, usa valores padrão e ainda gera a resposta.
 */
export async function generateCommercialTurn(
  context: AgentContext,
  options: CommercialTurnOptions & { agentConfig?: AgentSystemPromptInput } = {},
): Promise<CommercialTurnResult> {
  const agentConfig = options.agentConfig ?? {};

  // FASE 1 — ANÁLISE (Groq): rápida, decide como conduzir a resposta.
  const analysis = await analyzeConversation(context, agentConfig, options);

  // FASE 2 — RESPOSTA (OpenRouter): texto que o cliente verá.
  const replyStart = Date.now();
  let replyResult: AICompletionResult;
  try {
    replyResult = await providerManager.generate(
      buildCommercialReplyMessages(agentConfig, context, analysis),
      {
        maxTokens: options.maxTokens ?? 600,
        timeoutMs: options.timeoutMs ?? 45000,
        temperature: 0.6,
        provider: "openrouter",
      },
    );
  } catch (error) {
    logger.error("Falha ao gerar a resposta do turno comercial", {
      error: error instanceof Error ? error.message : String(error),
      provider: "openrouter",
    });
    throw error;
  }

  const reply = replyResult.text.trim();
  if (!reply) {
    throw new Error("resposta vazia do provedor");
  }

  logger.info("Turno comercial gerado", {
    stage: analysis.stage,
    technique: analysis.technique_used,
    action: analysis.action,
    reply_provider: replyResult.provider,
    reply_model: replyResult.model,
    analysis_provider: "groq",
    contact_type: context.contactType,
  });

  return {
    reply,
    customer: analysis.customer,
    conversation: { stage: analysis.stage },
    technique_used: analysis.technique_used,
    commercial_engine_version: COMMERCIAL_ENGINE_VERSION,
    action: analysis.action,
    provider: replyResult.provider,
    model: replyResult.model,
    inputTokens: analysis.inputTokens + replyResult.inputTokens,
    outputTokens: analysis.outputTokens + replyResult.outputTokens,
    latencyMs: analysis.latencyMs + (Date.now() - replyStart),
    structured: analysis.structured,
  };
}

/** Fase de análise da conversa: Groq decide estágio/técnica/ação (JSON). */
async function analyzeConversation(
  context: AgentContext,
  agentConfig: AgentSystemPromptInput,
  options: CommercialTurnOptions,
): Promise<
  {
    customer: { name: string | null; segment: string | null; interest: boolean | null };
    stage: CommercialStageValue;
    technique_used: CommercialTechnique;
    action: CommercialAction;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    structured: boolean;
  }
> {
  const started = Date.now();
  try {
    const result: AICompletionResult = await providerManager.generate(
      buildCommercialAnalysisMessages(agentConfig, context),
      {
        maxTokens: 400,
        timeoutMs: Math.min(options.timeoutMs ?? 20000, 20000),
        temperature: 0,
        jsonMode: true,
        provider: "groq",
      },
    );
    const parsed = extractJsonObject(result.text);
    const normalized = normalizeCommercialAnalysis(parsed);
    return {
      ...normalized,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: Date.now() - started,
      structured: true,
    };
  } catch (error) {
    logger.warn("Análise comercial via IA falhou; usando análise padrão", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      customer: { name: null, segment: null, interest: null },
      stage: "NEW",
      technique_used: "calibrated_questions",
      action: "CONTINUE_CONVERSATION",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      structured: false,
    };
  }
}