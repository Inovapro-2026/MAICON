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
import {
  AgentSystemPromptInput,
  TONE_DESCRIPTIONS,
  buildAgentMessages,
} from "./prompt-assembler";
import {
  buildCommercialAnalysisInstruction,
  buildGeneratorInstruction,
  COMMERCIAL_ENGINE_VERSION,
  CommercialAction,
  CommercialAnalysis,
  CommercialIntent,
  CommercialStageValue,
  CommercialTechnique,
  ConversationGoal,
  deterministicCommercialAnalysis,
  DecisionMemory,
  GENERATOR_CONDUCT,
  KnownFacts,
  NextAction,
  normalizeCommercialAnalysis,
} from "./commercial-engine";
import { extractJsonObject } from "./structured-config";
import { ChatMessage } from "./types";
import {
  MessageConfig,
  validateGeneratedReply,
} from "./response-validation";

const logger = createLogger("ai.commercial-turn");

export interface CommercialTurnResult {
  reply: string;
  customer: { name: string | null; segment: string | null; interest: boolean | null };
  conversation: { stage: CommercialStageValue };
  technique_used: CommercialTechnique;
  commercial_engine_version: string;
  action: CommercialAction;
  /** Intenção do cliente na última mensagem (decisão orientada a intenção). */
  intent: CommercialIntent;
  /** Fatos conhecidos sobre o cliente (valor + origem + confiança). */
  known: KnownFacts;
  /** Resumo curto e atualizado da conversa (memória persistente). */
  summary: string;
  /** Objetivo deste turno. */
  goal: ConversationGoal;
  /** Próximo passo comercial natural. */
  next_action: NextAction;
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
  /** Memória persistida da conversa (contexto do turno anterior). */
  memory?: DecisionMemory | null;
}

/**
 * Monta as mensagens da FASE 1 (análise): role curta + histórico + pedido de
 * análise JSON. Enxuta de propósito — o Groq tem TPM limitado, e a análise não
 * precisa das camadas SYSTEM (que são grandes e servem à geração da resposta).
 */
export function buildCommercialAnalysisMessages(
  agentConfig: AgentSystemPromptInput,
  context: AgentContext,
  memory?: DecisionMemory | null,
): ChatMessage[] {
  const memParts: string[] = [];
  if (memory?.summary) memParts.push(`Resumo da conversa: ${memory.summary}`);
  if (memory?.last_question) memParts.push(`Última pergunta que você fez: "${memory.last_question}"`);
  if (memory?.known) {
    const facts = memory.known;
    const f: string[] = [];
    if (facts.name) f.push(`nome=${facts.name.value}`);
    if (facts.segment) f.push(`segmento=${facts.segment.value}`);
    if (facts.need) f.push(`necessidade=${facts.need.value}`);
    if (facts.acquisition_channel) f.push(`canal=${facts.acquisition_channel.value}`);
    if (f.length) memParts.push(`Dados conhecidos do cliente: ${f.join(", ")}`);
  }

  return [
    {
      role: "system",
      content: [
        "Você é o analisador comercial do SAVYRON. Sua única tarefa é classificar a conversa comercial em intenção, contexto conhecido, objetivo e próximo passo — você NUNCA gera respostas para o cliente.",
        memParts.join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    ...context.history.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `Mensagem mais recente do cliente: "${context.history.at(-1)?.content ?? ""}".\n\n${buildCommercialAnalysisInstruction()}`,
    },
  ];
}

/**
 * Monta as mensagens da FASE 2 (resposta): prompt MÍNIMO de geração.
 *
 * O gerador NUNCA recebe as camadas SYSTEM pesadas (regras de segurança, regras
 * globais, Motor Comercial) — se recebesse, um modelo pequeno as ecoaria no
 * `reply` (vazamento de raciocínio). Ele recebe somente:
 *   1. identidade curta (nome/tom da empresa);
 *   2. contexto do cliente;
 *   3. histórico;
 *   4. diretiva curta de postura (Decision Engine), sem jargão interno.
 */
export function buildCommercialReplyMessages(
  agentConfig: AgentSystemPromptInput,
  context: AgentContext,
  analysis: CommercialAnalysis,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: buildGeneratorSystemPrompt(agentConfig) },
  ];

  const ctx: string[] = [];
  if (context.leadName) ctx.push(`Nome do cliente: ${context.leadName}`);
  if (context.businessName)
    ctx.push(`Estabelecimento: ${context.businessName}`);
  if (context.city && context.state)
    ctx.push(`Cidade: ${context.city}/${context.state}`);
  if (ctx.length) {
    messages.push({
      role: "system",
      content: `Contexto do cliente:\n${ctx.join("\n")}`,
    });
  }

  for (const m of context.history ?? []) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({
    role: "user",
    content: `${buildGeneratorInstruction(analysis)} ${GENERATOR_CONDUCT} Escreva agora a sua resposta ao cliente, direto e natural, em uma única mensagem.`,
  });
  return messages;
}

/** Identidade curta do gerador — sem regras, sem jargão, sem camadas internas. */
function buildGeneratorSystemPrompt(agentConfig: AgentSystemPromptInput): string {
  const agent = agentConfig.agent ?? {};
  const business = agentConfig.business ?? {};
  const settings = agentConfig.settings ?? {};
  const agentName = agent.name?.trim() || "Atendente virtual";

  const lines: string[] = [
    `Você é o assistente virtual "${agentName}" da SAVYRON, uma plataforma de prospecção e atendimento comercial com IA. Você conversa com clientes interessados na empresa que você representa.`,
  ];
  if (business.name?.trim()) {
    lines.push(`Você atende pela empresa: ${business.name.trim()}.`);
  }
  if (business.segment?.trim()) {
    lines.push(`Segmento da empresa: ${business.segment.trim()}.`);
  }
  if (business.description?.trim()) {
    lines.push(`Sobre a empresa: ${business.description.trim()}`);
  }
  const tone =
    settings.tone && TONE_DESCRIPTIONS[settings.tone]
      ? TONE_DESCRIPTIONS[settings.tone]
      : TONE_DESCRIPTIONS.FRIENDLY;
  lines.push(`Tom de voz: ${tone}.`);
  return lines.join("\n");
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

  // FASE 1 — ANÁLISE (Groq): JSON estruturado, decide como conduzir a resposta.
  const analysis = await analyzeConversation(context, agentConfig, options);

  // FASE 2 — RESPOSTA (OpenRouter) → OUTPUT VALIDATOR → (regen se necessário).
  const messageConfig = ((agentConfig.settings?.messageConfig ?? {}) as MessageConfig) ?? {};
  const { reply, replyResult } = await generateValidatedReply(
    agentConfig,
    context,
    analysis,
    messageConfig,
    options,
  );

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
    intent: analysis.intent,
    known: analysis.known,
    goal: analysis.goal,
    next_action: analysis.next_action,
    summary: analysis.summary,
    provider: replyResult.provider,
    model: replyResult.model,
    inputTokens: analysis.inputTokens + replyResult.inputTokens,
    outputTokens: analysis.outputTokens + replyResult.outputTokens,
    latencyMs: analysis.latencyMs + replyResult.latencyMs,
    structured: analysis.structured,
  };
}

/**
 * FASE 3 — OUTPUT VALIDATOR.
 * Gera a resposta e valida antes de devolver: se houver raciocínio interno
 * vazado ou violação de limites, regenera UMA vez. Se o vazamento persistir,
 * lança erro — o texto NUNCA chega ao cliente/playground como `reply`.
 */
async function generateValidatedReply(
  agentConfig: AgentSystemPromptInput,
  context: AgentContext,
  analysis: CommercialAnalysis,
  messageConfig: MessageConfig,
  options: CommercialTurnOptions,
): Promise<{ reply: string; replyResult: AICompletionResult }> {
  const runOnce = async (): Promise<{ text: string; result: AICompletionResult }> => {
    const result = await providerManager.generate(
      buildCommercialReplyMessages(agentConfig, context, analysis),
      {
        maxTokens: options.maxTokens ?? 600,
        timeoutMs: options.timeoutMs ?? 45000,
        temperature: 0.6,
        provider: "groq",
      },
    );
    const text = result.text.trim();
    if (!text) throw new Error("resposta vazia do provedor");
    return { text, result };
  };

  let { text, result } = await runOnce();
  let validation = validateGeneratedReply(text, messageConfig);

  // Rejeição por vazamento de raciocínio: regenera (nunca sanitiza o lixo).
  if (!validation.valid && validation.issues.includes("raciocínio interno vazado na resposta")) {
    logger.warn("Resposta com raciocínio vazado; regenerando", {
      provider: result.provider,
      excerpt: text.slice(0, 120),
    });
    const retry = await runOnce();
    text = retry.text;
    result = retry.result;
    validation = validateGeneratedReply(text, messageConfig);
    if (validation.issues.includes("raciocínio interno vazado na resposta")) {
      logger.error("Resposta continua com raciocínio vazado; abortando envio", {
        provider: result.provider,
      });
      throw new Error("saída do gerador inválida (raciocínio interno vazado)");
    }
  }

  // Violações sanitizáveis (perguntas em excesso, comprimento, frases, emojis).
  if (!validation.valid && validation.sanitized) {
    text = validation.sanitized;
  }

  return { reply: text, replyResult: result };
}

/** Fase de análise da conversa: Groq decide intenção/objetivo/próximo passo (JSON). */
async function analyzeConversation(
  context: AgentContext,
  agentConfig: AgentSystemPromptInput,
  options: CommercialTurnOptions,
): Promise<
  CommercialAnalysis & {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    structured: boolean;
  }
> {
  const started = Date.now();
  try {
    const result: AICompletionResult = await providerManager.generate(
      buildCommercialAnalysisMessages(agentConfig, context, options.memory),
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

    // O DECISION ENGINE DETERMINÍSTICO é AUTORITATIVO para stage/goal/next_action
    // (confiável e testado em golden conversations). O groq enriquece intenção e
    // fatos; a decisão de como conduzir a conversa vem do engine — isso evita que
    // um modelo pequeno (llama-3.1-8b-instant) trave a conversa na abertura.
    const decision = deterministicCommercialAnalysis({
      history: context.history,
      leadName: context.leadName,
      contactType: context.contactType,
      memory: options.memory,
    });

    const merged: CommercialAnalysis = {
      ...normalized,
      stage: decision.stage,
      goal: decision.goal,
      next_action: decision.next_action,
      action: decision.action,
      summary: decision.summary,
      customer: decision.customer,
      // Fatos: junta o que o LLM encontrou com o que o engine encontrou.
      known: {
        name: normalized.known.name ?? decision.known.name,
        segment: normalized.known.segment ?? decision.known.segment,
        need: normalized.known.need ?? decision.known.need,
        acquisition_channel: normalized.known.acquisition_channel ?? decision.known.acquisition_channel,
      },
    };

    return {
      ...merged,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: Date.now() - started,
      structured: true,
    };
  } catch (error) {
    logger.warn("Análise comercial via IA falhou; usando Decision Engine determinístico", {
      error: error instanceof Error ? error.message : String(error),
    });
    const fallback = deterministicCommercialAnalysis({
      history: context.history,
      leadName: context.leadName,
      contactType: context.contactType,
      memory: options.memory,
    });
    return {
      ...fallback,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      structured: false,
    };
  }
}