import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { AgentContext, IntentClassification } from '@prospector/types';
import {
  classifyIntent,
  generateAgentReply,
  PROMPT_VERSION,
  buildAgentMessages,
  buildSystemPrompt,
  loadAIConfiguration,
  validateGeneratedReply,
  AgentSystemPromptInput,
  MessageConfig,
} from '@prospector/ai';
import { getWorkerQueue } from '../queues';
import { createMessage } from '../services/messages';
import { publishRealtime } from '../services/realtime';
import { getLastInboundChannel } from '../services/conversations';
import { isOptedOut, registerOptOut } from '../services/leads';
import {
  resolveEffectiveStage,
  isOnboardingStage,
  runOnboardingTurn,
  OnboardingSendContext,
  OnboardingStage,
} from '../services/onboarding';
import { redis, CONVERSATION_LOCK_KEY, acquireLock, releaseLock } from '../services/redis';

const logger = createLogger('worker.ai-response');

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

const INTENT_TO_STATUS = {
  INTERESTED: 'INTERESTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  OPT_OUT: 'OPT_OUT',
  QUESTION: 'AGENT_ACTIVE',
  BUSY: 'AGENT_ACTIVE',
  RESPONDED: 'AGENT_ACTIVE',
  UNKNOWN: 'AGENT_ACTIVE',
} as const;

export async function processAIResponse(job: { id?: string; data: AIResponseData }): Promise<void> {
  const { conversationId, leadId, content, externalId } = job.data;
  const businessId = job.data.businessId;

  // -------------------------------------------------------------------------
  // 0) SERIALIZAÇÃO POR CONVERSA (concorrência)
  //    Duas mensagens simultâneas da mesma conversa NÃO podem processar juntas.
  //    Se outra execução está ativa, este turno é re-enfileirado com backoff
  //    (a máquina de estados re-resolve o estágio quando reprocessado).
  // -------------------------------------------------------------------------
  const lockKey = CONVERSATION_LOCK_KEY(conversationId);
  const locked = await acquireLock(lockKey, CONVERSATION_LOCK_TTL_MS);
  if (!locked) {
    const retries = job.data.lockRetry ?? 0;
    if (retries >= MAX_LOCK_RETRIES) {
      logger.warn('[AI_CONVERSATION] turno descartado após máx. tentativas de lock', {
        conversation_id: conversationId,
        lead_id: leadId,
        business_id: businessId,
        action: 'DROP_LOCK_TIMEOUT',
        external_id: externalId,
      });
      return;
    }
    await getWorkerQueue(QUEUE_NAMES.AI_RESPONSE).add(
      'respond',
      { ...job.data, lockRetry: retries + 1 },
      {
        jobId: `ai-lock-${conversationId}-${retries}-${Date.now()}`,
        delay: LOCK_RETRY_DELAY_MS,
        attempts: 1,
        removeOnComplete: true,
      }
    );
    logger.info('[AI_CONVERSATION] conversa em processamento; turno re-enfileirado', {
      conversation_id: conversationId,
      lead_id: leadId,
      business_id: businessId,
      action: 'REQUEUE_LOCKED',
      retry: retries + 1,
    });
    return;
  }

  try {
    await processConversationTurn({ conversationId, leadId, campaignId: job.data.campaignId, businessId, content, remoteJid: job.data.remoteJid, externalId });
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
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) {
    logger.warn('Conversa não encontrada para resposta IA', { conversation_id: conversationId });
    return;
  }
  if (conversation.human_handled) {
    logger.info('Conversa em modo manual; IA não responde', { conversation_id: conversationId });
    return;
  }
  if (await isOptedOut(leadId, ctx.businessId ?? conversation.business_id)) {
    logger.info('Lead opt-out; IA não responde', { lead_id: leadId });
    return;
  }

  let lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  const resolvedBusinessId = ctx.businessId ?? lead.business_id;

  // Histórico das últimas mensagens (a última é a mensagem recebida atual)
  const recentMessages = await prisma.message.findMany({
    where: { lead_id: leadId, business_id: resolvedBusinessId },
    orderBy: { created_at: 'asc' },
    take: 20,
  });

  const history = recentMessages.map((m) => ({
    role: (m.direction === 'IN' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }));

  const channel = await getLastInboundChannel(leadId, resolvedBusinessId);

  const sendCtx: OnboardingSendContext = {
    conversationId,
    leadId,
    businessId: resolvedBusinessId,
    campaignId,
    channel,
    remoteJid: ctx.remoteJid,
    phone: lead.phone,
    email: lead.email,
  };

  // -------------------------------------------------------------------------
  // 1) ONBOARDING: máquina de estados determinística (UMA mensagem por turno)
  // -------------------------------------------------------------------------
  const priorHistoryCount = Math.max(0, recentMessages.length - 1);
  let stage = await resolveEffectiveStage(conversation, priorHistoryCount);

  if (stage === 'NOT_STARTED' && priorHistoryCount > 0) {
    // Conversa já iniciada (ex.: campanha/abordagem enviou a 1ª mensagem):
    // não repetir a sequência de abertura; segue direto para a IA.
    stage = 'NAME_CAPTURED';
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { onboarding_stage: 'NAME_CAPTURED' },
    });
    logger.info('Abertura pulada: conversa já iniciada por campanha', {
      conversation_id: conversationId,
      lead_id: leadId,
    });
  }

  if (isOnboardingStage(stage)) {
    const agentConfig = await loadAIConfiguration(prisma, resolvedBusinessId);
    const useEmoji = shouldUseEmoji(agentConfig);
    const result = await runOnboardingTurn(
      stage as OnboardingStage,
      content,
      conversationId,
      leadId,
      sendCtx,
      agentConfig,
      { useEmoji }
    );
    if (result.handled) return;
  }

  // -------------------------------------------------------------------------
  // 2) IA assume a conversa (stage = NAME_CAPTURED / READY_FOR_AI)
  // -------------------------------------------------------------------------
  // 2.1) Classifica intenção
  let intent: IntentClassification;
  try {
    intent = await classifyIntent({ message: content, history });
  } catch (error) {
    logger.error('Falha na classificação; assumindo RESPONDED', { lead_id: leadId, error });
    intent = { intent: 'RESPONDED', confidence: 0.4, needsRegistrationLink: false, summary: '' };
  }

  if (intent.intent === 'OPT_OUT') {
    await registerOptOut(
      leadId,
      conversation.ai_provider === 'groq' ? 'WHATSAPP' : channel,
      'Solicitação de opt-out detectada',
      resolvedBusinessId
    );
    logger.info('Opt-out tratado pelo agente', { lead_id: leadId, conversation_id: conversationId });
    await sendGoodbye(leadId, campaignId, resolvedBusinessId, channel, ctx.remoteJid);
    publishRealtime({
      type: 'status_changed',
      conversationId,
      leadId,
      businessId: resolvedBusinessId,
      timestamp: new Date().toISOString(),
      payload: { lead_status: 'OPT_OUT', content: '', direction: 'OUT' },
    });
    return;
  }

  // 2.2) Gera resposta do agente usando a configuração de IA da empresa
  const context: AgentContext = {
    leadName: lead.name,
    businessName: lead.business_name,
    city: lead.city,
    state: lead.state,
    history,
    intent: intent.intent,
  };

  const agentConfig = await loadAIConfiguration(prisma, resolvedBusinessId);
  const systemPrompt = buildSystemPrompt(agentConfig);
  const messageConfig = (agentConfig.settings?.messageConfig ?? {}) as Record<string, unknown>;

  let result;
  try {
    result = await generateAgentReply(context, { systemPrompt });
  } catch (error) {
    logger.error('Falha ao gerar resposta IA', { lead_id: leadId, error });
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'ERROR' } });
    await prisma.campaignLead.updateMany({ where: { lead_id: leadId, business_id: resolvedBusinessId }, data: { status: 'ERROR' } });
    throw error;
  }

  // 2.3) VALIDAÇÃO DA SAÍDA (backend): uma pergunta por mensagem + limites.
  //      Resposta com múltiplas perguntas → regenera uma vez; se persistir,
  //      sanitiza mantendo somente a 1ª pergunta. Nunca fragmenta a mensagem.
  let reply = result.text;
  const validation = validateGeneratedReply(reply, messageConfig as MessageConfig);
  if (!validation.valid && validation.issues.includes('múltiplas perguntas na mesma resposta')) {
    logger.warn('[AI_CONVERSATION] resposta com múltiplas perguntas; regenerando', {
      business_id: resolvedBusinessId,
      conversation_id: conversationId,
      lead_id: leadId,
      stage: 'READY_FOR_AI',
      action: 'REGENERATE',
      provider: result.provider,
      issues: validation.issues,
    });
    try {
      const regenerated = await generateAgentReply(context, { systemPrompt });
      const revalidation = validateGeneratedReply(regenerated.text, messageConfig as MessageConfig);
      if (revalidation.valid) {
        reply = regenerated.text;
        result = regenerated;
      } else {
        reply = revalidation.sanitized ?? validation.sanitized ?? regenerated.text;
        result = regenerated;
      }
    } catch {
      reply = validation.sanitized ?? reply;
    }
  } else if (!validation.valid) {
    logger.warn('[AI_CONVERSATION] resposta ajustada para os limites configurados', {
      business_id: resolvedBusinessId,
      conversation_id: conversationId,
      lead_id: leadId,
      stage: 'READY_FOR_AI',
      action: 'SANITIZE',
      provider: result.provider,
      issues: validation.issues,
    });
    reply = validation.sanitized ?? reply;
  }

  // 2.4) Registra geração de IA (auditoria)
  const promptText = buildAgentMessages(agentConfig, context)
    .map((m) => m.content)
    .join('\n')
    .slice(0, 20000);
  await prisma.aIGeneration.create({
    data: {
      business_id: resolvedBusinessId,
      lead_id: leadId,
      conversation_id: conversationId,
      provider: result.provider,
      model: result.model,
      prompt_version: PROMPT_VERSION,
      prompt: promptText,
      completion: reply,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms: result.latencyMs,
    },
  });

  const message = await createMessage({
    leadId,
    businessId: resolvedBusinessId,
    campaignId,
    channel,
    direction: 'OUT',
    content: reply,
    status: 'QUEUED',
    provider: result.provider,
  });

  // 2.5) Atualiza status do lead/campanha conforme intenção
  const status = INTENT_TO_STATUS[intent.intent] ?? 'AGENT_ACTIVE';
  await prisma.lead.update({ where: { id: leadId }, data: { status } });
  await prisma.campaignLead.updateMany({ where: { lead_id: leadId, business_id: resolvedBusinessId }, data: { status } });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { ai_provider: result.provider, last_message_at: new Date() },
  });

  // 2.6) Emite eventos em tempo real
  const aiEventTimestamp = new Date().toISOString();
  publishRealtime({
    type: 'ai_response_generated',
    conversationId,
    leadId,
    businessId: resolvedBusinessId,
    timestamp: aiEventTimestamp,
    payload: { content: reply, direction: 'OUT', lead_status: status, human_handled: false },
  });
  publishRealtime({
    type: 'status_changed',
    conversationId,
    leadId,
    businessId: resolvedBusinessId,
    timestamp: aiEventTimestamp,
    payload: { lead_status: status, human_handled: false },
  });

  // 2.7) Enfileira o envio da resposta (UMA mensagem)
  const queue = channel === 'WHATSAPP' ? QUEUE_NAMES.WHATSAPP_SEND : QUEUE_NAMES.EMAIL_SEND;
  await getWorkerQueue(queue).add(
    'send',
    {
      campaignLeadId: undefined,
      leadId,
      campaignId,
      businessId: resolvedBusinessId,
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      message: reply,
      subject: 'Re: seu contato',
      messageId: message.id,
      retryCount: 0,
      aiGenerated: true,
      remoteJid: ctx.remoteJid,
    },
    { attempts: 1, removeOnComplete: true }
  );

  logger.info('[AI_CONVERSATION]', {
    business_id: resolvedBusinessId,
    conversation_id: conversationId,
    lead_id: leadId,
    external_id: ctx.externalId,
    stage: 'READY_FOR_AI',
    action: 'SEND_AI_REPLY',
    source: 'llm',
    response_count: 1,
    provider: result.provider,
    intent: intent.intent,
    validated: validation.valid,
  });
}

/** Decide se a confirmação de nome usa emoji conforme a config de mensagens. */
function shouldUseEmoji(agentConfig: AgentSystemPromptInput): boolean {
  const cfg = (agentConfig.settings?.messageConfig ?? {}) as Record<string, unknown>;
  if (cfg.use_emojis === false) return false;
  if (typeof cfg.max_emojis === 'number' && cfg.max_emojis === 0) return false;
  return true;
}

async function sendGoodbye(leadId: string, campaignId: string | undefined, businessId: string, channel: 'WHATSAPP' | 'EMAIL', remoteJid?: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  const goodbye = 'Sem problemas! Vou encerrar o contato. Qualquer coisa é só chamar. Até mais!';

  const message = await createMessage({
    leadId,
    businessId,
    campaignId,
    channel,
    direction: 'OUT',
    content: goodbye,
    status: 'QUEUED',
    provider: 'ai',
  });

  const queue = channel === 'WHATSAPP' ? QUEUE_NAMES.WHATSAPP_SEND : QUEUE_NAMES.EMAIL_SEND;
  await getWorkerQueue(queue).add(
    'send',
    {
      campaignLeadId: undefined,
      leadId,
      campaignId,
      businessId,
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      message: goodbye,
      subject: 'Re: seu contato',
      messageId: message.id,
      retryCount: 0,
      remoteJid,
    },
    { attempts: 1, removeOnComplete: true }
  );
}
