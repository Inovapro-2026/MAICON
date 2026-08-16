import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';

const logger = createLogger('worker.conversations');

/** Garante que existe uma conversa aberta para o lead. */
export async function ensureConversation(leadId: string, businessId: string): Promise<string> {
  const existing = await prisma.conversation.findFirst({
    where: { business_id: businessId, lead_id: leadId },
  });
  if (existing) return existing.id;

  const conversation = await prisma.conversation.create({
    data: { business_id: businessId, lead_id: leadId, status: 'OPEN', stage: 'NEW' },
  });
  logger.debug('Conversa criada', { conversation_id: conversation.id, lead_id: leadId, business_id: businessId });
  return conversation.id;
}

export async function touchConversation(conversationId: string, businessId?: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { last_message_at: new Date() },
  });
}

/** Busca a última mensagem de um canal do lead (para decidir canal de resposta). */
export async function getLastInboundChannel(leadId: string, businessId?: string): Promise<'WHATSAPP' | 'EMAIL'> {
  const last = await prisma.message.findFirst({
    where: {
      lead_id: leadId,
      direction: 'IN',
      ...(businessId ? { business_id: businessId } : {}),
    },
    orderBy: { created_at: 'desc' },
  });
  return last?.channel ?? 'WHATSAPP';
}
