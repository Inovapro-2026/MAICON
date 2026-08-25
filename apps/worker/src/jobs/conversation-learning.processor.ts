import { prisma, Prisma } from "@prospector/database";
import { config } from "@prospector/config";
import { createLogger } from "@prospector/logger";
import {
  analyzeConversation,
  computeTenantStrategies,
  CommercialStageValue,
  LearningInput,
  LearningThresholds,
} from "@prospector/ai";

const logger = createLogger("worker.conversation-learning");

interface ConversationLearningData {
  businessId: string;
  conversationId: string;
  leadId: string;
  trigger: string;
}

/**
 * CONVERSATION LEARNING — análise assíncrona por tenant.
 *
 * Consome UMA conversa, produz o insight bruto (`SalesConversationInsight`) e
 * recalcula as estratégias comerciais do tenant. É 100% assíncrono: nunca
 * participa do caminho de resposta do WhatsApp. Toda leitura/escrita é
 * filtrada por `businessId` (isolamento multi-tenant).
 */
export async function processConversationLearning(job: {
  id?: string;
  data: ConversationLearningData;
}): Promise<void> {
  const { businessId, conversationId, leadId, trigger } = job.data;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      logger.warn("[LEARNING] conversa não encontrada; insight descartado", {
        business_id: businessId,
        conversation_id: conversationId,
      });
      return;
    }

    // Mensagens do lead (histórico do tenant; Message não tem conversation_id).
    const messages = await prisma.message.findMany({
      where: { business_id: businessId, lead_id: leadId },
      orderBy: { created_at: "asc" },
      take: 200,
    });

    // Gerações de IA desta conversa (próximo passo decidido por turno).
    const generations = await prisma.aIGeneration.findMany({
      where: { business_id: businessId, conversation_id: conversationId },
      orderBy: { created_at: "asc" },
      take: 200,
    });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });

    const status =
      conversation.status === "CLOSED" ||
      conversation.human_handled === true ||
      conversation.stage === "CLOSED_WON" ||
      conversation.stage === "CLOSED_LOST"
        ? "CLOSED"
        : "OPEN";

    const input: LearningInput = {
      tenantId: businessId,
      conversationId,
      leadId,
      messages: messages.map((m) => ({
        direction: (m.direction === "IN" ? "IN" : "OUT") as "IN" | "OUT",
        content: m.content,
      })),
      conversation: {
        stage: (conversation.stage as CommercialStageValue | null) ?? null,
        status: status as "OPEN" | "CLOSED",
        leadSegment: lead?.segment ?? null,
        leadInterest: lead?.status === "INTERESTED" ? true : null,
      },
      generations: generations.map((g) => ({
        technique: g.technique_used ?? null,
        nextAction: g.next_action ?? null,
        interest: null,
      })),
    };

    const insight = analyzeConversation(input);

    // Upsert do insight (1 por conversa — idempotente).
    await prisma.salesConversationInsight.upsert({
      where: { conversation_id: conversationId },
      create: {
        business_id: businessId,
        conversation_id: conversationId,
        lead_id: leadId,
        segment: insight.segment,
        acquisition_channel: insight.acquisitionChannel,
        stage_at_close: insight.stageAtClose ?? null,
        outcome: insight.outcome,
        message_count: insight.messageCount,
        agent_question_count: insight.agentQuestionCount,
        customer_message_count: insight.customerMessageCount,
        messages_to_price: insight.messagesToPrice,
        messages_to_conversion: insight.messagesToConversion,
        last_agent_question: insight.lastAgentQuestion,
        last_customer_message: insight.lastCustomerMessage,
        pains: insight.pains,
        objections: insight.objections,
        needs: insight.needs,
        questions: insight.questions as unknown as Prisma.InputJsonValue,
        techniques: insight.techniques,
        strategy_used: insight.strategyUsed,
        updated_at: new Date(),
      },
      update: {
        segment: insight.segment,
        acquisition_channel: insight.acquisitionChannel,
        stage_at_close: insight.stageAtClose ?? null,
        outcome: insight.outcome,
        message_count: insight.messageCount,
        agent_question_count: insight.agentQuestionCount,
        customer_message_count: insight.customerMessageCount,
        messages_to_price: insight.messagesToPrice,
        messages_to_conversion: insight.messagesToConversion,
        last_agent_question: insight.lastAgentQuestion,
        last_customer_message: insight.lastCustomerMessage,
        pains: insight.pains,
        objections: insight.objections,
        needs: insight.needs,
        questions: insight.questions as unknown as Prisma.InputJsonValue,
        techniques: insight.techniques,
        strategy_used: insight.strategyUsed,
        updated_at: new Date(),
      },
    });

    // Recalcula as estratégias do tenant (thresholds da config learning.*).
    const thresholds = {
      minSamplesActive: config.learning.minSamplesActive,
      minContinuityActive: config.learning.minContinuityActive,
      minConfidence: config.learning.minConfidence,
      discardContinuity: config.learning.discardContinuity,
    };
    const updatedStrategies = await computeTenantStrategies(
      prisma,
      businessId,
      thresholds,
    );

    logger.info("[LEARNING] análise de conversa concluída", {
      business_id: businessId,
      conversation_id: conversationId,
      lead_id: leadId,
      trigger,
      outcome: insight.outcome,
      message_count: insight.messageCount,
      agent_question_count: insight.agentQuestionCount,
      pains: insight.pains.length,
      objections: insight.objections.length,
      questions_events: insight.questions.length,
      updated_strategies: updatedStrategies,
    });
  } catch (error) {
    logger.error("[LEARNING] falha ao analisar conversa", {
      business_id: businessId,
      conversation_id: conversationId,
      lead_id: leadId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}