import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import {
  buildOpeningMessages,
  buildNameConfirmedMessage,
  validateClientName,
  decideConversationTurn,
  AgentSystemPromptInput,
} from '@prospector/ai';
import { getWorkerQueue } from '../queues';
import { createMessage } from './messages';
import { publishRealtime } from './realtime';

const logger = createLogger('worker.onboarding');

/**
 * MÁQUINA DE ESTADOS DE ONBOARDING (controlada pelo CÓDIGO, não pelo LLM).
 *
 * Estágios persistidos em `Conversation.onboarding_stage` (coluna existente):
 *
 *   NOT_STARTED            → 1ª mensagem do cliente recebida
 *   GREETED                → saudação enviada; aguardando o cliente aceitar
 *                            (equivale a AWAITING_FIRST_RESPONSE)
 *   AWAITING_NAME          → pergunta do nome enviada; aguardando o nome
 *   NAME_CAPTURED          → nome salvo; conversa pronta para a IA
 *                            (equivale a READY_FOR_AI)
 *
 * Regra ABSOLUTA: UMA mensagem do cliente → UMA etapa → UMA resposta → fim.
 * Somente uma nova mensagem do cliente avança a conversa.
 */

export type OnboardingStage =
  | 'NOT_STARTED'
  | 'GREETED'
  | 'COMPANY_INTRODUCED'
  | 'AWAITING_NAME'
  | 'NAME_CAPTURED';

const VALID_STAGES: ReadonlySet<string> = new Set([
  'NOT_STARTED',
  'GREETED',
  'COMPANY_INTRODUCED',
  'AWAITING_NAME',
  'NAME_CAPTURED',
]);

export function isOpeningStage(stage: OnboardingStage | null | undefined): boolean {
  return stage === 'NOT_STARTED' || stage === 'GREETED' || stage === 'COMPANY_INTRODUCED';
}

/** Estágios que exigem resposta determinística do backend (sem chamar o LLM). */
export function isOnboardingStage(stage: OnboardingStage | null | undefined): boolean {
  return isOpeningStage(stage) || stage === 'AWAITING_NAME';
}

/**
 * Resolve o estágio efetivo da conversa.
 * Conversas legadas (coluna nula) derivam: com histórico prévio → NAME_CAPTURED
 * (preserva fluxos existentes), sem histórico → NOT_STARTED (inicia onboarding).
 */
export async function resolveEffectiveStage(
  conversation: { id: string; onboarding_stage: OnboardingStage | null | undefined },
  priorHistoryCount: number
): Promise<OnboardingStage> {
  if (conversation.onboarding_stage && VALID_STAGES.has(conversation.onboarding_stage)) {
    return conversation.onboarding_stage as OnboardingStage;
  }
  const derived: OnboardingStage = priorHistoryCount > 0 ? 'NAME_CAPTURED' : 'NOT_STARTED';
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { onboarding_stage: derived },
  });
  logger.info('Estágio de onboarding derivado para conversa legada', {
    conversation_id: conversation.id,
    onboarding_stage: derived,
  });
  return derived;
}

/**
 * Transição ATÔMICA de estágio. Retorna true apenas se a conversa ainda estava
 * no estágio esperado. Sob concorrência, apenas um processamento vence; o
 * perdedor não envia mensagem.
 */
export async function advanceStage(
  conversationId: string,
  expected: OnboardingStage,
  next: OnboardingStage
): Promise<boolean> {
  const result = await prisma.conversation.updateMany({
    where: { id: conversationId, onboarding_stage: expected },
    data: { onboarding_stage: next },
  });
  return result.count > 0;
}

export interface OnboardingSendContext {
  conversationId: string;
  leadId: string;
  businessId: string;
  campaignId?: string;
  channel: 'WHATSAPP' | 'EMAIL';
  remoteJid?: string;
  phone: string | null;
  email: string | null;
}

/** Cria a mensagem OUT e enfileira o envio (mesmo padrão do fluxo de IA). */
export async function queueOutbound(ctx: OnboardingSendContext, content: string): Promise<void> {
  await createMessage({
    leadId: ctx.leadId,
    businessId: ctx.businessId,
    campaignId: ctx.campaignId,
    channel: ctx.channel,
    direction: 'OUT',
    content,
    status: 'QUEUED',
    provider: 'ai',
  });

  const queue = ctx.channel === 'WHATSAPP' ? QUEUE_NAMES.WHATSAPP_SEND : QUEUE_NAMES.EMAIL_SEND;
  await getWorkerQueue(queue).add(
    'send',
    {
      campaignLeadId: undefined,
      leadId: ctx.leadId,
      campaignId: ctx.campaignId,
      businessId: ctx.businessId,
      phone: ctx.phone ?? '',
      email: ctx.email ?? '',
      message: content,
      subject: 'Re: seu contato',
      messageId: undefined,
      retryCount: 0,
      aiGenerated: true,
      remoteJid: ctx.remoteJid,
    },
    { attempts: 1, removeOnComplete: true }
  );

  publishRealtime({
    type: 'ai_response_generated',
    conversationId: ctx.conversationId,
    leadId: ctx.leadId,
    businessId: ctx.businessId,
    timestamp: new Date().toISOString(),
    payload: { content, direction: 'OUT', human_handled: false },
  });
}

export interface OnboardingAction {
  /** true = a mensagem foi totalmente tratada pelo onboarding (turno encerrado). */
  handled: boolean;
  action?: string;
}

/**
 * Executa a próxima etapa do onboarding com base no estágio atual.
 * Garantia: no máximo UMA mensagem é enviada por turno e, ao terminar, o
 * processamento é encerrado (a próxima mensagem do cliente avança a conversa).
 */
export async function runOnboardingTurn(
  stage: OnboardingStage,
  content: string,
  conversationId: string,
  leadId: string,
  ctx: OnboardingSendContext,
  agentConfig: AgentSystemPromptInput,
  options: { useEmoji?: boolean } = {}
): Promise<OnboardingAction> {
  const openingCtx = {
    agentName: agentConfig.agent?.name,
    agentRole: agentConfig.agent?.role,
    businessName: agentConfig.business?.name,
    businessSegment: agentConfig.business?.segment,
    businessDescription: agentConfig.business?.description,
  };

  // Valida o nome apenas no estágio que espera um nome (evita chamada de IA à toa).
  let nameValidation: { valid: boolean; name?: string; reason?: string } | undefined;
  if (stage === 'AWAITING_NAME') {
    nameValidation = await validateClientName(content);
  }

  const decision = decideConversationTurn({ stage, content, nameValidation });

  switch (decision.action) {
    // ── NOT_STARTED → GREEDED: envia APENAS a saudação de abertura.
    case 'SEND_GREETING': {
      const msgs = buildOpeningMessages(openingCtx);
      logger.info('[AI_ONBOARDING]', {
        business_id: ctx.businessId,
        conversation_id: conversationId,
        lead_id: leadId,
        stage: 'NOT_STARTED',
        action: 'SEND_GREETING',
        source: 'backend-template',
        response_count: 1,
      });
      await queueOutbound(ctx, msgs.greeting);
      await advanceStage(conversationId, 'NOT_STARTED', 'GREETED');
      return { handled: true, action: 'SEND_GREETING' };
    }

    // ── GREEDED → AWAITING_NAME: apenas se o cliente aceitou o convite.
    case 'SEND_ASK_NAME': {
      const msgs = buildOpeningMessages(openingCtx);
      logger.info('[AI_ONBOARDING]', {
        business_id: ctx.businessId,
        conversation_id: conversationId,
        lead_id: leadId,
        stage,
        action: 'SEND_ASK_NAME',
        source: 'backend-template',
        response_count: 1,
      });
      await queueOutbound(ctx, msgs.askName);
      await advanceStage(conversationId, stage, 'AWAITING_NAME');
      return { handled: true, action: 'SEND_ASK_NAME' };
    }

    // ── GREEDED sem aceite: não avança e não envia (próxima mensagem decide).
    case 'WAIT': {
      logger.info('[AI_ONBOARDING]', {
        business_id: ctx.businessId,
        conversation_id: conversationId,
        lead_id: leadId,
        stage,
        action: 'WAIT_USER',
        source: 'backend-template',
        response_count: 0,
      });
      return { handled: true, action: 'WAIT' };
    }

    // ── AWAITING_NAME com nome válido → salva, confirma e libera a IA depois.
    case 'SEND_NAME_CONFIRMED': {
      const validatedName = nameValidation?.name ?? content.trim();
      await prisma.lead.update({ where: { id: leadId }, data: { name: validatedName } });
      const confirm = buildNameConfirmedMessage(validatedName, { useEmoji: options.useEmoji });
      logger.info('[AI_ONBOARDING]', {
        business_id: ctx.businessId,
        conversation_id: conversationId,
        lead_id: leadId,
        stage: 'AWAITING_NAME',
        action: 'NAME_CAPTURED',
        contact_name: validatedName,
        response_count: 1,
      });
      await queueOutbound(ctx, confirm);
      await advanceStage(conversationId, 'AWAITING_NAME', 'NAME_CAPTURED');
      return { handled: true, action: 'NAME_CAPTURED' };
    }

    // ── AWAITING_NAME com resposta inválida: pede o nome de novo, mantém estágio.
    case 'SEND_ASK_NAME_AGAIN': {
      const msgs = buildOpeningMessages(openingCtx);
      logger.info('[AI_ONBOARDING]', {
        business_id: ctx.businessId,
        conversation_id: conversationId,
        lead_id: leadId,
        stage: 'AWAITING_NAME',
        action: 'WAIT_NAME',
        reason: nameValidation?.reason,
        response_count: 1,
      });
      await queueOutbound(ctx, msgs.askNameAgain);
      return { handled: true, action: 'ASK_NAME_AGAIN' };
    }

    default:
      // Outros estágios não pertencem ao onboarding → deixa o chamador seguir.
      return { handled: false };
  }
}
