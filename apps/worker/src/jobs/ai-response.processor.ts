import { prisma, LeadStatus } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { QUEUE_NAMES } from "@prospector/queues";
import { AgentContext } from "@prospector/types";
import {
  generateCommercialTurn,
  PROMPT_VERSION,
  buildCommercialTurnMessages,
  loadAIConfiguration,
  validateGeneratedReply,
  MessageConfig,
} from "@prospector/ai";
import { getWorkerQueue } from "../queues";
import {
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

const CONVERSATION_LOCK_TTL_MS = 120000;
const LOCK_RETRY_DELAY_MS = 10000;
const MAX_LOCK_RETRIES = 3;

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
  const engagedStatus = ["INTERESTED", "NOT_INTERESTED", "RESPONDED", "AGENT_ACTIVE"];
  const contactType: "novo" | "conhecido" =
    (lead.status && engagedStatus.includes(lead.status)) || priorHistoryCount >= 4
      ? "conhecido"
      : "novo";

  const context: AgentContext = {
    leadName: lead.name,
    businessName: lead.business_name,
    city: lead.city,
    state: lead.state,
    history,
    contactType,
    conversationStage: conversation.stage,
  };

  const agentConfig = await loadAIConfiguration(prisma, resolvedBusinessId);
  const messageConfig = (agentConfig.settings?.messageConfig ?? {}) as Record<string, unknown>;

  let result;
  try {
    // MOTOR COMERCIAL: a IA avalia a conversa e decide técnica + estágio + ação,
    // devolvendo saída ESTRUTURADA (reply, customer, conversation, technique_used,
    // commercial_engine_version, action) — a IA é dinâmica, sem roteiro fixo.
    result = await generateCommercialTurn(context, { agentConfig });
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

  // VALIDAÇÃO DA SAÍDA (backend): uma pergunta por mensagem + limites.
  let reply = result.reply;
  const validation = validateGeneratedReply(reply, messageConfig as MessageConfig);
  if (!validation.valid && validation.issues.includes("múltiplas perguntas na mesma resposta")) {
    logger.warn("[AI_CONVERSATION] resposta com múltiplas perguntas; regenerando", {
      business_id: resolvedBusinessId,
      conversation_id: conversationId,
      lead_id: leadId,
      action: "REGENERATE",
      provider: result.provider,
      issues: validation.issues,
    });
    try {
      const regenerated = await generateCommercialTurn(context, { agentConfig });
      const revalidation = validateGeneratedReply(regenerated.reply, messageConfig as MessageConfig);
      if (revalidation.valid) {
        reply = regenerated.reply;
        result = regenerated;
      } else {
        reply = revalidation.sanitized ?? validation.sanitized ?? regenerated.reply;
        result = regenerated;
      }
    } catch {
      reply = validation.sanitized ?? reply;
    }
  } else if (!validation.valid) {
    logger.warn("[AI_CONVERSATION] resposta ajustada para os limites configurados", {
      business_id: resolvedBusinessId,
      conversation_id: conversationId,
      lead_id: leadId,
      action: "SANITIZE",
      provider: result.provider,
      issues: validation.issues,
    });
    reply = validation.sanitized ?? reply;
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
      prompt: promptText,
      completion: reply,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms: result.latencyMs,
    },
  });

  const { message, created } = await createOrGetAiReplyMessage({
    leadId,
    businessId: resolvedBusinessId,
    campaignId,
    channel,
    content: reply,
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
    await prisma.conversation.update({ where: { id: conversationId }, data: conversationUpdate });

    const nowIso = new Date().toISOString();
    publishRealtime({
      type: "ai_response_generated",
      conversationId,
      leadId,
      businessId: resolvedBusinessId,
      timestamp: nowIso,
      payload: {
        content: reply,
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

  // Enfileira o envio da resposta (UMA mensagem). Em reutilização da mensagem
  // (retry), reenfileira o envio pendente — idempotente no envio.
  const queue = channel === "WHATSAPP" ? QUEUE_NAMES.WHATSAPP_SEND : QUEUE_NAMES.EMAIL_SEND;
  await getWorkerQueue(queue).add(
    "send",
    {
      campaignLeadId: undefined,
      leadId,
      campaignId,
      businessId: resolvedBusinessId,
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      message: reply,
      subject: "Re: seu contato",
      messageId: message.id,
      retryCount: 0,
      aiGenerated: true,
      remoteJid: ctx.remoteJid,
    },
    { attempts: 1, removeOnComplete: true },
  );

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