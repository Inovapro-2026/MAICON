import { prisma, LeadStatus } from "@prospector/database";
import { config } from "@prospector/config";
import { createLogger } from "@prospector/logger";
import { hasRealLeadName } from "@prospector/utils";
import { QUEUE_NAMES } from "@prospector/queues";
import { AgentContext } from "@prospector/types";
import {
  generateCommercialTurn,
  PROMPT_VERSION,
  buildCommercialTurnMessages,
  loadAIConfiguration,
  validateGeneratedReply,
  splitReplyForSending,
  MessageConfig,
  loadConversationMemory,
  saveConversationMemory,
  buildMemoryFromResult,
  memoryKeyConversation,
  questionFromNextAction,
} from "@prospector/ai";
import { getWorkerQueue } from "../queues";
import {
  createMessage,
  createOrGetAiReplyMessage,
  wasAiResponded,
  markAiResponded,
} from "../services/messages";
import { publishRealtime } from "../services/realtime";
import { getLastInboundChannel } from "../services/conversations";
import { isOptedOut } from "../services/leads";
import {
  redis,
  CONVERSATION_LOCK_KEY,
  acquireLock,
  releaseLock,
} from "../services/redis";

const logger = createLogger("worker.ai-response");

const CONVERSATION_LOCK_TTL_MS = 180000;
const LOCK_RETRY_DELAY_MS = 10000;
const MAX_LOCK_RETRIES = 6;

/** Delay natural (aleatório) entre mensagens fracionadas da IA no WhatsApp. */
function splitMessageDelay(): number {
  const min = config.ai.messageSplitDelayMinMs;
  const max = config.ai.messageSplitDelayMaxMs;
  return Math.round(min + Math.random() * Math.max(0, max - min));
}

interface AIResponseData {
  conversationId: string;
  leadId: string;
  campaignId?: string;
  businessId?: string;
  content: string;
  remoteJid?: string;
  externalId?: string;
  lockRetry?: number;
}

export async function processAIResponse(job: {
  id?: string;
  data: AIResponseData;
}): Promise<void> {
  const { conversationId, leadId, content, externalId } = job.data;
  const businessId = job.data.businessId;

  // -------------------------------------------------------------------------
  // 0) SERIALIZAÇÃO POR CONVERSA (concorrência)
  //    Duas mensagens simultâneas da mesma conversa NÃO podem processar juntas.
  //    Se outra execução está ativa, este turno é re-enfileirado com backoff.
  // -------------------------------------------------------------------------
  const lockKey = CONVERSATION_LOCK_KEY(conversationId);
  const locked = await acquireLock(lockKey, CONVERSATION_LOCK_TTL_MS);
  if (!locked) {
    const retries = job.data.lockRetry ?? 0;
    if (retries >= MAX_LOCK_RETRIES) {
      logger.warn(
        "[AI_CONVERSATION] turno descartado após máx. tentativas de lock",
        {
          conversation_id: conversationId,
          lead_id: leadId,
          business_id: businessId,
          action: "DROP_LOCK_TIMEOUT",
          external_id: externalId,
        },
      );
      return;
    }
    await getWorkerQueue(QUEUE_NAMES.AI_RESPONSE).add(
      "respond",
      { ...job.data, lockRetry: retries + 1 },
      {
        jobId: `ai-lock-${conversationId}-${retries}-${Date.now()}`,
        delay: LOCK_RETRY_DELAY_MS,
        attempts: 1,
        removeOnComplete: true,
      },
    );
    logger.info(
      "[AI_CONVERSATION] conversa em processamento; turno re-enfileirado",
      {
        conversation_id: conversationId,
        lead_id: leadId,
        business_id: businessId,
        action: "REQUEUE_LOCKED",
        retry: retries + 1,
      },
    );
    return;
  }

  try {
    await processConversationTurn({
      conversationId,
      leadId,
      campaignId: job.data.campaignId,
      businessId,
      content,
      remoteJid: job.data.remoteJid,
      externalId,
    });
  } finally {
    await releaseLock(lockKey);
  }
}

interface TurnContext {
  conversationId: string;
  leadId: string;
  campaignId?: string;
  businessId?: string;
  content: string;
  remoteJid?: string;
  externalId?: string;
}

async function processConversationTurn(ctx: TurnContext): Promise<void> {
  const { conversationId, leadId, campaignId, content } = ctx;

  // Releitura após lock: garante estágio/estado mais recente da conversa.
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    logger.warn("Conversa não encontrada para resposta IA", {
      conversation_id: conversationId,
    });
    return;
  }
  if (conversation.human_handled) {
    logger.info("Conversa em modo manual; IA não responde", {
      conversation_id: conversationId,
    });
    return;
  }
  if (await isOptedOut(leadId, ctx.businessId ?? conversation.business_id)) {
    logger.info("Lead opt-out; IA não responde", { lead_id: leadId });
    return;
  }

  const resolvedBusinessId = ctx.businessId ?? conversation.business_id;

  // IDEMPOTÊNCIA DO TURNO: se este message_id recebido já gerou resposta,
  // não gerar de novo (protege contra retry do BullMQ após envio já feito).
  if (await wasAiResponded(resolvedBusinessId, ctx.externalId)) {
    logger.info(
      "[AI_CONVERSATION] resposta já gerada para este message_id; ignorando turno duplicado",
      {
        conversation_id: conversationId,
        lead_id: leadId,
        business_id: resolvedBusinessId,
        action: "SKIP_ALREADY_RESPONDED",
        external_id: ctx.externalId,
      },
    );
    return;
  }

  let lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  const recentMessages = await prisma.message.findMany({
    where: { lead_id: leadId, business_id: resolvedBusinessId },
    orderBy: { created_at: "asc" },
    take: 20,
  });

  const history = recentMessages.map((m) => ({
    role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  const channel = await getLastInboundChannel(leadId, resolvedBusinessId);
  const priorHistoryCount = Math.max(0, recentMessages.length - 1);

  // Qualidade de resposta: pergunta repetida sem resposta satisfatória.
  const previousInbound = history.filter((h) => h.role === "user").slice(0, -1);
  const repeatedQuestion = previousInbound.some((p) =>
    isNearDuplicate(p.content, content),
  );
  if (repeatedQuestion) {
    logger.warn(
      "[AI_QUALITY] pergunta repetida detectada — resposta anterior provavelmente insatisfatória",
      {
        lead_id: leadId,
        conversation_id: conversationId,
        business_id: resolvedBusinessId,
        current: content.slice(0, 200),
      },
    );
  }

  // Perfil do contato (dado real/persistente): determina o modo vendedora vs suporte.
  const engagedStatus = [
    "INTERESTED",
    "NOT_INTERESTED",
    "RESPONDED",
    "AGENT_ACTIVE",
  ];
  const contactType: "novo" | "conhecido" =
    (lead.status && engagedStatus.includes(lead.status)) ||
    priorHistoryCount >= 4
      ? "conhecido"
      : "novo";

  // Leads auto-criados (mensagem recebida de número desconhecido) recebem
  // name "Novo contato" — não é um nome real. A IA não deve cumprimentar nem
  // pular a sequência por causa dele.
  const realLeadName = hasRealLeadName(lead.name) ? lead.name : null;

  const context: AgentContext = {
    leadName: realLeadName,
    businessName: lead.business_name,
    city: lead.city,
    state: lead.state,
    history,
    contactType,
    conversationStage: conversation.stage,
  };

  const agentConfig = await loadAIConfiguration(prisma, resolvedBusinessId);
  const messageConfig = (agentConfig.settings?.messageConfig ?? {}) as Record<
    string,
    unknown
  >;

  // CONVERSATION MEMORY: carrega o estado persistido do turno anterior para
  // interpretar fragmentos ("redes sociais", "como") no contexto certo.
  const memKey = memoryKeyConversation(conversationId);
  const memory = await loadConversationMemory(
    prisma,
    resolvedBusinessId,
    memKey,
  );

  let result;
  try {
    // MOTOR COMERCIAL: a IA avalia a conversa e decide intenção + objetivo +
    // próximo passo, devolvendo saída ESTRUTURADA — a IA é dinâmica, sem
    // roteiro fixo de abertura, e usa a memória persistida + a Descrição da
    // empresa como contexto. Sem sequência fixa de onboarding (removida).
    result = await generateCommercialTurn(context, {
      agentConfig,
      memory,
    });
  } catch (error) {
    logger.error("Falha ao gerar resposta IA", { lead_id: leadId, error });
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: "ERROR" },
    });
    await prisma.campaignLead.updateMany({
      where: { lead_id: leadId, business_id: resolvedBusinessId },
      data: { status: "ERROR" },
    });
    throw error;
  }

  // VALIDAÇÃO DA SAÍDA (backend): a resposta já passou pelo OUTPUT VALIDATOR em
  // `generateValidatedReply` (máx. 1 pergunta, limites, sem vazamento de
  // raciocínio). Aqui apenas revalidamos para auditoria e aplicamos sanitização
  // residual — NUNCA regeneramos o turno inteiro (evita custo/latência extras).
  let reply = result.reply;
  const validation = validateGeneratedReply(
    reply,
    messageConfig as MessageConfig,
  );
  if (!validation.valid && validation.sanitized) {
    logger.warn(
      "[AI_CONVERSATION] resposta ajustada para os limites configurados",
      {
        business_id: resolvedBusinessId,
        conversation_id: conversationId,
        lead_id: leadId,
        action: "SANITIZE",
        provider: result.provider,
        issues: validation.issues,
      },
    );
    reply = validation.sanitized;
  }

  // CONVERSATION MEMORY: persiste o estado ATUALIZADO antes da próxima
  // resposta — a próxima mensagem já encontra o contexto pronto. As perguntas
  // já feitas acumulam (evita re-perguntar) e a última mensagem do cliente
  // garante continuidade entre turnos.
  try {
    const askedQuestions = Array.from(
      new Set([
        ...(memory?.asked_questions ?? []),
        ...(questionFromNextAction(result.next_action)
          ? [questionFromNextAction(result.next_action)]
          : []),
      ]),
    ).slice(-12);
    await saveConversationMemory(
      prisma,
      resolvedBusinessId,
      memKey,
      buildMemoryFromResult({
        ...result,
        asked_questions: askedQuestions,
        last_customer_message: content,
      }),
    );
  } catch (error) {
    logger.warn("Falha ao persistir memória da conversa", {
      conversation_id: conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Registra geração de IA (auditoria) + rastreabilidade do Motor Comercial.
  const promptText = buildCommercialTurnMessages(agentConfig, context)
    .map((m) => m.content)
    .join("\n")
    .slice(0, 20000);
  await prisma.aIGeneration.create({
    data: {
      business_id: resolvedBusinessId,
      lead_id: leadId,
      conversation_id: conversationId,
      provider: result.provider,
      model: result.model,
      prompt_version: PROMPT_VERSION,
      technique_used: result.technique_used,
      commercial_engine_version: result.commercial_engine_version,
      next_action: result.next_action,
      prompt: promptText,
      completion: reply,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms: result.latencyMs,
    },
  });

  // CONVERSATION LEARNING (assíncrono): enfileira a análise da conversa para o
  // aprendizado por tenant. Nunca bloqueia a resposta — o enqueue falha em
  // silêncio (observabilidade) e o worker do aprendizado consome depois.
  await enqueueConversationLearning(resolvedBusinessId, conversationId, leadId);

  // DIVISÃO INTELIGENTE: respeita o limite de caracteres configurado sem cortar
  // no meio da palavra. Se couber em 1 mensagem, envia 1; se exceder e a config
  // permitir mais mensagens, divide em até 2 (fronteira de frase).
  const replyParts = splitReplyForSending(reply, messageConfig as MessageConfig);
  const firstContent = replyParts[0] ?? reply;

  const { message, created } = await createOrGetAiReplyMessage({
    leadId,
    businessId: resolvedBusinessId,
    campaignId,
    channel,
    content: firstContent,
    incomingExternalId: ctx.externalId,
  });

  if (created) {
    // MEMÓRIA DO CLIENTE (Fase E): nomes/segmentos descobertos pela IA são
    // persistidos no lead — um telefone = um cliente por tenant.
    const leadUpdate: Record<string, unknown> = {};
    if (result.customer.name && lead.name !== result.customer.name) {
      leadUpdate.name = result.customer.name;
    }
    if (result.customer.segment && lead.segment !== result.customer.segment) {
      leadUpdate.segment = result.customer.segment;
    }

    // Status do lead conforme intenção/sinal comercial (Motor Comercial).
    let leadStatus: LeadStatus;
    if (result.action === "TRANSFER_TO_HUMAN") leadStatus = "AGENT_ACTIVE";
    else if (result.customer.interest === true) leadStatus = "INTERESTED";
    else if (result.customer.interest === false) leadStatus = "NOT_INTERESTED";
    else leadStatus = "AGENT_ACTIVE";
    leadUpdate.status = leadStatus;

    if (Object.keys(leadUpdate).length) {
      await prisma.lead.update({ where: { id: leadId }, data: leadUpdate });
    }
    await prisma.campaignLead.updateMany({
      where: { lead_id: leadId, business_id: resolvedBusinessId },
      data: { status: leadStatus },
    });

    // Atualiza a conversa: estágio comercial + rastreabilidade do motor.
    const conversationUpdate: Record<string, unknown> = {
      stage: result.conversation.stage,
      commercial_engine_version: result.commercial_engine_version,
      last_technique_used: result.technique_used,
      ai_provider: result.provider,
      last_message_at: new Date(),
    };
    if (result.action === "TRANSFER_TO_HUMAN") {
      conversationUpdate.human_handled = true;
    }
    if (result.action === "CLOSE_CONVERSATION") {
      conversationUpdate.status = "CLOSED";
    }
    await prisma.conversation.update({
      where: { id: conversationId },
      data: conversationUpdate,
    });

    const nowIso = new Date().toISOString();
    publishRealtime({
      type: "ai_response_generated",
      conversationId,
      leadId,
      businessId: resolvedBusinessId,
      timestamp: nowIso,
      payload: {
        content: firstContent,
        direction: "OUT",
        lead_status: leadStatus,
        conversation_stage: result.conversation.stage,
        technique_used: result.technique_used,
        human_handled: conversationUpdate.human_handled === true,
      },
    });
    publishRealtime({
      type: "status_changed",
      conversationId,
      leadId,
      businessId: resolvedBusinessId,
      timestamp: nowIso,
      payload: {
        lead_status: leadStatus,
        conversation_stage: result.conversation.stage,
        human_handled: conversationUpdate.human_handled === true,
      },
    });
  }

  // Enfileira o envio da resposta (1ª mensagem). Em reutilização da mensagem
  // (retry), reenfileira o envio pendente — idempotente no envio.
  const queue =
    channel === "WHATSAPP" ? QUEUE_NAMES.WHATSAPP_SEND : QUEUE_NAMES.EMAIL_SEND;
  await getWorkerQueue(queue).add(
    "send",
    {
      campaignLeadId: undefined,
      leadId,
      campaignId,
      businessId: resolvedBusinessId,
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      message: firstContent,
      subject: "Re: seu contato",
      messageId: message.id,
      retryCount: 0,
      aiGenerated: true,
      remoteJid: ctx.remoteJid,
    },
    { attempts: 1, removeOnComplete: true },
  );

  // 2ª mensagem: (a) followUp do primeiro contato (pergunta do nome) OU (b) a
  // resposta dividida em fronteira de frase. Nunca corta palavra. Enviada com
  // um pequeno delay natural após a 1ª.
  const secondPart = result.followUp ?? replyParts[1];
  if (secondPart) {
    const secondExternalId = ctx.externalId
      ? `reply:${ctx.externalId}:2`
      : undefined;
    const existingSecond = secondExternalId
      ? await prisma.message.findFirst({
          where: { business_id: resolvedBusinessId, external_id: secondExternalId },
          select: { id: true },
        })
      : null;
    if (existingSecond) {
      logger.info("[AI_CONVERSATION] 2ª parte da resposta já registrada", {
        conversation_id: conversationId,
        lead_id: leadId,
        action: "SKIP_DUPLICATE_REPLY_PART2",
        external_id: ctx.externalId,
        message_id: existingSecond.id,
      });
    } else {
      const secondMessage = await createMessage({
        leadId,
        businessId: resolvedBusinessId,
        campaignId,
        channel,
        direction: "OUT",
        content: secondPart,
        status: "QUEUED",
        provider: "ai",
        externalId: secondExternalId,
      });
      await getWorkerQueue(queue).add(
        "send",
        {
          campaignLeadId: undefined,
          leadId,
          campaignId,
          businessId: resolvedBusinessId,
          phone: lead.phone ?? "",
          email: lead.email ?? "",
          message: secondPart,
          subject: "Re: seu contato",
          messageId: secondMessage.id,
          retryCount: 0,
          aiGenerated: true,
          remoteJid: ctx.remoteJid,
        },
        { attempts: 1, removeOnComplete: true, delay: splitMessageDelay() },
      );
      logger.info("[AI_CONVERSATION] resposta dividida em 2 mensagens", {
        conversation_id: conversationId,
        lead_id: leadId,
        action: "SPLIT_REPLY",
        first_chars: firstContent.length,
        second_chars: secondPart.length,
        external_id: ctx.externalId,
      });
    }
  }

  // Marca que este message_id recebido já foi respondido (idempotência).
  // Somente após o envio estar enfileirado — assim um retry pós-criação
  // reenfileira o envio pendente em vez de perder a resposta.
  markAiResponded(resolvedBusinessId, ctx.externalId);

  if (!created) {
    logger.info(
      "[AI_CONVERSATION] resposta IA já registrada para este message_id; envio pendente reenfileirado",
      {
        conversation_id: conversationId,
        lead_id: leadId,
        business_id: resolvedBusinessId,
        action: "SKIP_DUPLICATE_REPLY",
        external_id: ctx.externalId,
        message_id: message.id,
      },
    );
    return;
  }

  logger.info("[AI_CONVERSATION]", {
    business_id: resolvedBusinessId,
    conversation_id: conversationId,
    lead_id: leadId,
    external_id: ctx.externalId,
    stage: result.conversation.stage,
    action: result.action,
    technique_used: result.technique_used,
    commercial_engine_version: result.commercial_engine_version,
    source: "llm",
    response_count: 1,
    provider: result.provider,
    structured: result.structured,
    validated: validation.valid,
  });
}

/**
 * Enfileira a análise de aprendizado da conversa (CONVERSATION LEARNING).
 * Assíncrono e nunca bloqueia a resposta: falha é logada e ignorada. Usa
 * dedup em Redis (janela por conversa) para analisar a cada N mensagens e
 * SEMPRE no fechamento/transferência — sem flood de jobs.
 */
async function enqueueConversationLearning(
  businessId: string,
  conversationId: string,
  leadId: string,
): Promise<void> {
  try {
    const analyzeEvery = Math.max(1, config.learning.analyzeEveryMessages ?? 4);
    const windowKey = `learning:window:${businessId}:${conversationId}`;
    const count = await redis.incr(windowKey);
    if (count === 1) {
      await redis.expire(windowKey, 3600);
    }
    if (count % analyzeEvery !== 0) return;

    await getWorkerQueue(QUEUE_NAMES.CONVERSATION_LEARNING).add(
      "analyze",
      {
        businessId,
        conversationId,
        leadId,
        trigger: "ai_response",
      },
      {
        jobId: `learning-${businessId}-${conversationId}-${count}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    );
    logger.debug("[LEARNING] análise de conversa enfileirada", {
      business_id: businessId,
      conversation_id: conversationId,
      lead_id: leadId,
      trigger: "ai_response",
      message_index: count,
    });
  } catch (error) {
    logger.warn("[LEARNING] falha ao enfileirar análise de conversa", {
      business_id: businessId,
      conversation_id: conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Normaliza texto para comparação (sem acentos/caixa/pontuação). */
function normalizeForCompare(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detecta pergunta repetida: a mensagem atual é igual ou praticamente igual a
 * uma mensagem recebida anteriormente — sinal de resposta anterior
 * insatisfatória (indicador de qualidade).
 */
function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length < nb.length ? na : nb;
  if (shorter.length < 8) return false;
  return na.includes(nb) || nb.includes(na);
}
