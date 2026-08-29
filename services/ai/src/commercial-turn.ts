/**
 * Turno comercial estruturado — SAVYRON.
 *
 * Fluxo em DUAS fases (PROVEDOR ÚNICO: Groq — llama-3.1-8b-instant):
 * 1. ANÁLISE (Groq): decide estágio, técnica, ação e dados do cliente a partir
 *    da conversa — a análise é rápida e barata. O Decision Engine determinístico
 *    é autoritativo para stage/goal/next_action (testado em golden conversations).
 * 2. RESPOSTA (Groq): gera o texto que o cliente realmente verá, seguindo a
 *    análise. A resposta nunca é enviada como JSON ao cliente.
 *
 * A IA conduz a conversa inteira de forma DINÂMICA: não existe sequência fixa
 * de abertura, texto de saudação hardcoded nem roteiro de perguntas. As regras
 * de comportamento vêm da Descrição da empresa (configurada pelo usuário),
 * da Base de conhecimento, da memória persistida e do histórico — o modelo é
 * livre para seguir o que está configurado.
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
  getRelevantKnowledge,
  KnowledgeItem,
  KnownFacts,
  NextAction,
  normalizeCommercialAnalysis,
  normalizeAgentMode,
  buildAgentModeInstruction,
} from "./commercial-engine";
import { recommendNextAction } from "./strategy-engine";
import { RuntimeStrategy, StrategyRecommendation } from "./learning/types";
import { extractJsonObject } from "./structured-config";
import { ChatMessage } from "./types";
import {
  MessageConfig,
  PLATFORM_POLICY,
  shouldSummarizeReply,
  validateGeneratedReply,
} from "./response-validation";

const logger = createLogger("ai.commercial-turn");

/** Próximos passos do Decision Engine em que uma pergunta de descoberta pode
 * ser refinada pelo Strategy Engine (o restante é inegociável: responder,
 * tratar objeção, transferir, encerrar). */
const DISCOVERY_NEXT_ACTIONS: readonly NextAction[] = [
  "ASK_NAME",
  "ASK_BUSINESS_TYPE",
  "ASK_CURRENT_ACQUISITION",
  "ASK_CURRENT_PROCESS",
  "UNDERSTAND_PAIN",
  "EXPLAIN_RELEVANT_SOLUTION",
];

/** Ação legada derivada do próximo passo (nunca bloqueia uma condução). */
function actionFrom(next: NextAction): CommercialAction {
  if (next === "TRANSFER_TO_HUMAN") return "TRANSFER_TO_HUMAN";
  if (next === "CLOSE_CONVERSATION") return "CLOSE_CONVERSATION";
  return "CONTINUE_CONVERSATION";
}

export interface CommercialTurnResult {
  reply: string;
  /**
   * 2ª mensagem do turno (opcional): atualmente nenhum fluxo força uma segunda
   * mensagem fixa — o worker pode dividir a resposta longa em fronteira de frase.
   */
  followUp?: string;
  customer: {
    name: string | null;
    segment: string | null;
    interest: boolean | null;
  };
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
  /** Títulos dos itens da base de conhecimento usados nesta resposta. */
  knowledge_used: string[];
  provider: AICompletionResult["provider"];
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** true se a análise estruturada foi obtida; false = análise padrão (fallback). */
  structured: boolean;
  /** Estratégia aprendida do tenant que refinou o próximo passo (se houver). */
  strategy_used?: StrategyRecommendation | null;
}

export interface CommercialTurnOptions {
  timeoutMs?: number;
  maxTokens?: number;
  /** Memória persistida da conversa (contexto do turno anterior). */
  memory?: DecisionMemory | null;
  /** Estratégias comerciais ATIVAS do tenant (aprendidas) para o Strategy Engine. */
  strategies?: RuntimeStrategy[];
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
  if (memory?.last_question)
    memParts.push(`Última pergunta que você fez: "${memory.last_question}"`);
  if (memory?.known) {
    const facts = memory.known;
    const f: string[] = [];
    if (facts.name) f.push(`nome=${facts.name.value}`);
    if (facts.segment) f.push(`segmento=${facts.segment.value}`);
    if (facts.need) f.push(`necessidade=${facts.need.value}`);
    if (facts.acquisition_channel)
      f.push(`canal=${facts.acquisition_channel.value}`);
    if (facts.pain) f.push(`dor=${facts.pain.value}`);
    if (facts.objective) f.push(`objetivo=${facts.objective.value}`);
    if (facts.budget) f.push(`orçamento=${facts.budget.value}`);
    if (facts.objection) f.push(`objeção=${facts.objection.value}`);
    if (facts.tools) f.push(`processo=${facts.tools.value}`);
    if (f.length) memParts.push(`Dados conhecidos do cliente: ${f.join(", ")}`);
  }
  if (memory?.asked_questions && memory.asked_questions.length > 0) {
    const seen = Array.from(new Set(memory.asked_questions.slice(-6)))
      .map((q) => `"${q}"`)
      .join(", ");
    memParts.push(
      `Perguntas que você JÁ fez nesta conversa (não repita o mesmo assunto): ${seen}.`,
    );
  }
  if (memory?.last_customer_message) {
    memParts.push(
      `Última mensagem do cliente: "${memory.last_customer_message}"`,
    );
  }

  // A última mensagem do cliente é repetida na instrução final — remove-a do
  // histórico para não duplicar contexto/tokens na FASE 1.
  const historyForAnalysis = [...context.history];
  if (historyForAnalysis.at(-1)?.role === "user") {
    historyForAnalysis.pop();
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
    ...historyForAnalysis.map((m) => ({ role: m.role, content: m.content })),
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
  knowledge?: KnowledgeItem[],
  askedQuestions?: string[],
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

  // BASE DE CONHECIMENTO relevante (Motor Comercial ativo — após a sequência
  // de abertura). Conteúdo real para responder com precisão, sem inventar.
  if (knowledge && knowledge.length > 0) {
    const kLines = knowledge
      .map((k) => `- ${k.title.trim()}: ${k.content.trim()}`)
      .join("\n");
    messages.push({
      role: "system",
      content: `Base de conhecimento (sua fonte de ARGUMENTOS comerciais — use apenas o que for relevante ao momento e nunca invente nada fora dela; se houver link de produto/vitrine/agendamento, ofereça-o quando fizer sentido conduzir à conversão):\n${kLines}`,
    });
  }

  for (const m of context.history ?? []) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({
    role: "user",
    content: `${buildGeneratorInstruction(analysis, askedQuestions)} ${GENERATOR_CONDUCT} Escreva agora a sua resposta ao cliente, direto e natural, em uma única mensagem.`,
  });
  return messages;
}

/** Identidade curta do gerador — sem regras, sem jargão, sem camadas internas. */
function buildGeneratorSystemPrompt(
  agentConfig: AgentSystemPromptInput,
): string {
  const agent = agentConfig.agent ?? {};
  const business = agentConfig.business ?? {};
  const settings = agentConfig.settings ?? {};
  const agentName = agent.name?.trim() || "Atendente virtual";

  const lines: string[] = [
    // Identidade NEUTRA: o assistente representa a EMPRESA configurada (nome/
    // segmento/descrição abaixo), nunca a plataforma SAVYRON — sem texto
    // institucional hardcoded que possa competir com a Descrição do cliente.
    `Você é o assistente virtual "${agentName}". Você conversa com clientes interessados na empresa que você representa.`,
    "Você é um ESPECIALISTA EM VENDAS consultivo e estratégico: seu papel é ENTENDER → QUALIFICAR → DESCUBRIR A NECESSIDADE → APRESENTAR VALOR → CONTORNAR OBJEÇÕES → CONDUZIR para o próximo passo comercial — nunca um chatbot de FAQ. Pode vender qualquer oferta cadastrada na base de conhecimento (produtos, serviços, assinaturas, SaaS, agendamentos, soluções B2B).",
  ];

  // OBJETIVO DO AGENTE (agent_mode): injeta o modo (vendas/suporte/híbrido).
  const agentMode = normalizeAgentMode(settings.agentMode);
  lines.push(buildAgentModeInstruction(agentMode));
  if (business.name?.trim()) {
    lines.push(`Você atende pela empresa: ${business.name.trim()}.`);
  }
  if (business.segment?.trim()) {
    lines.push(`Segmento da empresa: ${business.segment.trim()}.`);
  }
  if (business.description?.trim()) {
    // ATENÇÃO: a linha abaixo é verificada por testes de snapshot.
    // Preserve a literal `Sobre a empresa: ${business.description.trim()}` nesta posição.
    lines.push(
      `## DESCRIÇÃO DA EMPRESA E INSTRUÇÕES DE COMPORTAMENTO (REGRA MÁXIMA DA EMPRESA - PRIORIDADE ABSOLUTA):\nSobre a empresa: ${business.description.trim()}\n\nSiga RIGOROSAMENTE as regras de fluxo, conduta, respostas e ofertas descritas acima. Elas têm prioridade máxima sobre quaisquer posturas ou perguntas padrão.`,
    );
  }
  const tone =
    settings.tone && TONE_DESCRIPTIONS[settings.tone]
      ? TONE_DESCRIPTIONS[settings.tone]
      : TONE_DESCRIPTIONS.FRIENDLY;
  lines.push(`Tom de voz: ${tone}.`);

  // FATOS ESTRUTURADOS DA EMPRESA (fonte oficial — nunca inventar).
  const facts: string[] = [];
  if (business.website?.trim())
    facts.push(`Site/Vitrine: ${business.website.trim()}`);
  if (business.instagram?.trim())
    facts.push(`Instagram: ${business.instagram.trim()}`);
  if (business.phone?.trim()) facts.push(`Telefone/WhatsApp: ${business.phone.trim()}`);
  if (business.email?.trim()) facts.push(`E-mail: ${business.email.trim()}`);
  if (business.openingHours?.trim())
    facts.push(`Horário de atendimento: ${business.openingHours.trim()}`);
  if (business.address?.trim()) facts.push(`Localização/Endereço: ${business.address.trim()}`);
  if (business.targetAudience?.trim())
    facts.push(`Público-alvo: ${business.targetAudience.trim()}`);
  if (business.problemsSolved?.trim())
    facts.push(`Problemas que a empresa resolve: ${business.problemsSolved.trim()}`);
  if (business.differentials?.trim())
    facts.push(`Diferenciais: ${business.differentials.trim()}`);
  if (business.serviceArea?.trim())
    facts.push(`Área de atendimento: ${business.serviceArea.trim()}`);
  if (business.businessObjectives?.trim())
    facts.push(`Objetivo principal: ${business.businessObjectives.trim()}`);
  if (business.positioning?.trim())
    facts.push(`Posicionamento: ${business.positioning.trim()}`);
  if (business.additionalInstructions?.trim())
    facts.push(`Instruções adicionais da empresa: ${business.additionalInstructions.trim()}`);
  if (facts.length > 0) {
    lines.push(`FATOS OFICIAIS DA EMPRESA (use exatamente estes valores quando relevante — nunca invente URLs, perfis ou contatos):\n${facts.join("\n")}`);
  }

  // Prioridade das fontes de informação (empresa > base > memória > contexto > modelo).
  lines.push(
    "Prioridade das informações: 1) dados da empresa/configuração; 2) base de conhecimento fornecida; 3) memória da conversa (fatos já ditos pelo cliente); 4) contexto da mensagem; 5) conhecimento geral. Nunca invente dados fora do que foi fornecido.",
  );

  // Limite de tamanho configurado (AISettings.messageConfig) chega AO MODELO:
  // ele gera curto desde a origem, em vez de depender de corte pós-processamento.
  const msgCfg = (settings.messageConfig ?? {}) as MessageConfig;
  const maxLen =
    typeof msgCfg.max_length === "number" && msgCfg.max_length > 0
      ? Math.min(msgCfg.max_length, PLATFORM_POLICY.max_length)
      : PLATFORM_POLICY.max_length;
  const maxMsgs =
    typeof msgCfg.max_messages_per_reply === "number" &&
    msgCfg.max_messages_per_reply > 0
      ? Math.max(1, Math.min(Math.floor(msgCfg.max_messages_per_reply), 2))
      : 1;
  lines.push(
    `Seja MUITO conciso: responda em no máximo ${maxLen} caracteres por mensagem, idealmente 1-3 frases curtas, em no máximo ${maxMsgs} mensagem(ns) — prefira UMA mensagem. Pergunta simples → 1 mensagem curta e objetiva. Cliente pedindo mais detalhes ("explica melhor", "quero saber mais") → você pode usar até ${maxMsgs} mensagens, mas seja objetivo, mantenha o sentido completo e pergunte o que especificamente ele quer saber, em vez de despejar um resumo institucional inteiro. Nunca escreva um parágrafo institucional longo — responda o essencial e avance a conversa.`,
  );

  lines.push(
    "Regra de integridade: NUNCA invente preços, valores, planos, condições ou funcionalidades. Responda apenas com o que estiver explícito na base de conhecimento e no contexto fornecidos. Se não tiver a informação (ex.: preço), diga honestamente que não a tem e ofereça encaminhar para um atendente humano.",
  );
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
 * Gera um turno comercial em duas fases: análise (Groq) + resposta (Groq).
 * Se a análise falhar, usa valores padrão e ainda gera a resposta.
 */
export async function generateCommercialTurn(
  context: AgentContext,
  options: CommercialTurnOptions & {
    agentConfig?: AgentSystemPromptInput;
  } = {},
): Promise<CommercialTurnResult> {
  const agentConfig = options.agentConfig ?? {};

  // FASE 1 — ANÁLISE (LLM + Decision Engine determinístico): JSON estruturado,
  // decide como conduzir a resposta. Sem roteiro fixo de abertura — a IA conduz
  // a conversa inteira seguindo a Descrição + Base de conhecimento + memória.
  const analysis = await analyzeConversation(context, agentConfig, options);

  // BASE DE CONHECIMENTO: busca por relevância na mensagem atual + histórico
  // recente (resolve "qual valor?" pelo produto já discutido, "quanto custa?"
  // pelos itens com preço e "me manda o link" pelos itens com link).
  const knowledgeContext = [
    ...(context.history ?? []).slice(-6).map((m) => m.content),
    context.history?.at(-1)?.content ?? "",
  ].join(" ");
  const knowledgeUsed: KnowledgeItem[] = agentConfig.knowledge?.length
    ? getRelevantKnowledge(knowledgeContext, agentConfig.knowledge)
    : [];

  logger.debug("[SALES_AI] contexto do motor comercial", {
    company_context_loaded: Boolean(agentConfig.business),
    customer_memory_loaded: Boolean(options.memory),
    knowledge_total: agentConfig.knowledge?.length ?? 0,
    relevant_knowledge: knowledgeUsed.length,
    knowledge_titles: knowledgeUsed.map((k) => k.title),
  });

  // FASE 2 — RESPOSTA (Groq) → OUTPUT VALIDATOR → (regen se necessário).
  const messageConfig =
    ((agentConfig.settings?.messageConfig ?? {}) as MessageConfig) ?? {};
  const { reply, replyResult } = await generateValidatedReply(
    agentConfig,
    context,
    analysis,
    messageConfig,
    options,
    knowledgeUsed,
  );

  logger.info("Turno comercial gerado", {
    stage: analysis.stage,
    technique: analysis.technique_used,
    action: analysis.action,
    reply_provider: replyResult.provider,
    reply_model: replyResult.model,
    analysis_provider: analysis.provider ?? "deterministic",
    contact_type: context.contactType,
    follow_up: false,
    strategy_used: analysis.strategy_used
      ? {
          strategy_id: analysis.strategy_used.strategyId,
          strategy_version: analysis.strategy_used.strategyVersion,
          tenant_id: analysis.strategy_used.tenantId,
          confidence: analysis.strategy_used.confidence,
          missing_fact: analysis.strategy_used.missingFact,
        }
      : null,
  });

  return {
    reply,
    followUp: undefined,
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
    knowledge_used: knowledgeUsed.map((k) => k.title),
    provider: replyResult.provider,
    model: replyResult.model,
    inputTokens: analysis.inputTokens + replyResult.inputTokens,
    outputTokens: analysis.outputTokens + replyResult.outputTokens,
    latencyMs: analysis.latencyMs + replyResult.latencyMs,
    structured: analysis.structured,
    strategy_used: analysis.strategy_used,
  };
}

/**
 * RESUMO (rede de segurança): quando o modelo gera uma resposta longa demais
 * para caber na capacidade configurada (máx. caracteres × máx. mensagens), uma
 * REESCRITA CONCISA mantém o sentido completo — em vez de truncar o final e
 * perder informação (nunca "corta no meio da palavra"). Falha → mantém o texto
 * original (o OUTPUT VALIDATOR já garante fronteira de frase/palavra).
 */
async function summarizeReplyToFit(
  text: string,
  config: MessageConfig,
): Promise<string> {
  const maxLen =
    typeof config.max_length === "number" && config.max_length > 0
      ? Math.min(config.max_length, PLATFORM_POLICY.max_length)
      : PLATFORM_POLICY.max_length;
  const result = await providerManager.generate(
    [
      {
        role: "system",
        content: `Você é um revisor de mensagens de um atendente de IA. Reescreva a mensagem abaixo de forma CONCISA, mantendo o sentido completo e o tom natural, em no máximo ${maxLen} caracteres (1-3 frases curtas). NÃO acrescente informação nova nem invente dados. Retorne apenas a mensagem reescrita, sem comentários, sem aspas e sem quebrar palavras.`,
      },
      { role: "user", content: text },
    ],
    {
      maxTokens: 300,
      timeoutMs: 20000,
      temperature: 0.3,
      provider: "nvidia",
    },
  );
  const summarized = result.text.trim();
  if (!summarized) throw new Error("resumo vazio do provedor");
  return summarized;
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
  knowledge?: KnowledgeItem[],
): Promise<{ reply: string; replyResult: AICompletionResult }> {
  const runOnce = async (): Promise<{
    text: string;
    result: AICompletionResult;
  }> => {
    const messages = buildCommercialReplyMessages(
      agentConfig,
      context,
      analysis,
      knowledge,
      options.memory?.asked_questions,
    );
    // Log explícito do prompt FINAL enviado ao provider (diagnóstico): o texto
    // exato que gera a resposta do cliente — company description, conhecimento,
    // histórico, memória e diretiva. Nenhum gate de "sequência de abertura".
    logger.debug("[SALES_AI] prompt final de RESPOSTA (provider)", {
      messages,
      description_chars: (agentConfig.business?.description ?? "").length,
      history_turns: (context.history ?? []).length,
      knowledge_items: knowledge?.length ?? 0,
    });
    const result = await providerManager.generate(messages, {
      maxTokens: options.maxTokens ?? 600,
      timeoutMs: options.timeoutMs ?? 45000,
      temperature: 0.6,
      provider: "nvidia",
    });
    const text = result.text.trim();
    if (!text) throw new Error("resposta vazia do provedor");
    return { text, result };
  };

  let { text, result } = await runOnce();
  let validation = validateGeneratedReply(text, messageConfig);

  // Rejeição por vazamento de raciocínio: regenera (nunca sanitiza o lixo).
  if (
    !validation.valid &&
    validation.issues.includes("raciocínio interno vazado na resposta")
  ) {
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

  // REDE DE SEGURANÇA — RESUMO: se a resposta (mesmo sanitizada) não cabe na
  // capacidade configurada (máx. caracteres × máx. mensagens), pede uma versão
  // concisa em vez de entregar truncada/incompleta. Falha no resumo → mantém o
  // texto sanitizado (nunca perde o turno, nunca corta palavra).
  if (shouldSummarizeReply(text, messageConfig)) {
    const beforeChars = text.length;
    try {
      const summarized = await summarizeReplyToFit(text, messageConfig);
      const summaryValidation = validateGeneratedReply(
        summarized,
        messageConfig,
      );
      if (
        summaryValidation.valid ||
        (summaryValidation.sanitized &&
          !summaryValidation.issues.includes(
            "raciocínio interno vazado na resposta",
          ))
      ) {
        text = summaryValidation.sanitized ?? summarized;
      }
      logger.info("[AI_CONVERSATION] resposta resumida para caber no limite", {
        before_chars: beforeChars,
        after_chars: text.length,
        max_len: messageConfig.max_length,
      });
    } catch (error) {
      logger.warn("Resumo da resposta falhou; mantém texto sanitizado", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    provider: string;
    strategy_used: StrategyRecommendation | null;
  }
> {
  const strategies = options.strategies ?? agentConfig.strategies ?? [];
  const started = Date.now();
  try {
    const result: AICompletionResult = await providerManager.generate(
      buildCommercialAnalysisMessages(agentConfig, context, options.memory),
      {
        maxTokens: 400,
        timeoutMs: Math.min(options.timeoutMs ?? 20000, 20000),
        temperature: 0,
        jsonMode: true,
        provider: "nvidia",
      },
    );
    const parsed = extractJsonObject(result.text);
    const normalized = normalizeCommercialAnalysis(parsed);

    // O DECISION ENGINE DETERMINÍSTICO é AUTORITATIVO para stage/goal/next_action
    // (confiável e testado em golden conversations). O LLM enriquece intenção e
    // fatos; a decisão de como conduzir a conversa vem do engine — evita que um
    // modelo pequeno trave a conversa na abertura.
    const decision = deterministicCommercialAnalysis({
      history: context.history,
      leadName: context.leadName,
      contactType: context.contactType,
      memory: options.memory,
    });

    // STRATEGY ENGINE: se o tenant tem uma estratégia ativa (aprendida) para
    // descobrir um fato ainda faltante deste lead, ela refina o próximo passo do
    // Decision Engine — sem nunca repetir perguntas já feitas. Só atua quando o
    // Decision Engine vai fazer uma pergunta de descoberta.
    let next_action = decision.next_action;
    let strategyUsed: StrategyRecommendation | null = null;
    if (DISCOVERY_NEXT_ACTIONS.includes(decision.next_action)) {
      strategyUsed = recommendNextAction(strategies, {
        known: decision.known,
        askedActions: [decision.next_action],
        askedQuestions: options.memory?.asked_questions,
        minConfidence: 60,
      });
      if (strategyUsed) {
        next_action = strategyUsed.nextAction;
        logger.info("[STRATEGY_ENGINE] estratégia aplicada ao turno", {
          tenantId: strategyUsed.tenantId,
          strategy_id: strategyUsed.strategyId,
          strategy_version: strategyUsed.strategyVersion,
          missing_fact: strategyUsed.missingFact,
          next_action,
          confidence: strategyUsed.confidence,
          sample_count: strategyUsed.sampleCount,
          continuity_rate: strategyUsed.continuityRate,
          reason: strategyUsed.reason,
        });
      }
    }

    const merged: CommercialAnalysis = {
      ...normalized,
      stage: decision.stage,
      goal:
        next_action === "UNDERSTAND_PAIN" ||
        next_action === "ASK_CURRENT_ACQUISITION" ||
        next_action === "ASK_CURRENT_PROCESS"
          ? "understand_pain"
          : next_action === "ASK_NAME" || next_action === "ASK_BUSINESS_TYPE"
            ? "discover_business"
            : decision.goal,
      next_action,
      action: actionFrom(next_action),
      summary: decision.summary,
      customer: decision.customer,
      // Fatos: junta o que o LLM encontrou com o que o engine encontrou.
      known: {
        name: normalized.known.name ?? decision.known.name,
        segment: normalized.known.segment ?? decision.known.segment,
        need: normalized.known.need ?? decision.known.need,
        acquisition_channel:
          normalized.known.acquisition_channel ??
          decision.known.acquisition_channel,
        pain: normalized.known.pain ?? decision.known.pain,
        objective: normalized.known.objective ?? decision.known.objective,
        budget: normalized.known.budget ?? decision.known.budget,
        objection: normalized.known.objection ?? decision.known.objection,
        tools: normalized.known.tools ?? decision.known.tools,
      },
    };

    return {
      ...merged,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: Date.now() - started,
      structured: true,
      provider: result.provider,
      strategy_used: strategyUsed,
    };
  } catch (error) {
    logger.warn(
      "Análise comercial via IA falhou; usando Decision Engine determinístico",
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    const fallback = deterministicCommercialAnalysis({
      history: context.history,
      leadName: context.leadName,
      contactType: context.contactType,
      memory: options.memory,
    });
    let next_action = fallback.next_action;
    let strategyUsed: StrategyRecommendation | null = null;
    if (DISCOVERY_NEXT_ACTIONS.includes(fallback.next_action)) {
      strategyUsed = recommendNextAction(strategies, {
        known: fallback.known,
        askedActions: [fallback.next_action],
        askedQuestions: options.memory?.asked_questions,
        minConfidence: 60,
      });
      if (strategyUsed) next_action = strategyUsed.nextAction;
    }
    return {
      ...fallback,
      next_action,
      action: actionFrom(next_action),
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      structured: false,
      provider: "deterministic",
      strategy_used: strategyUsed,
    };
  }
}
