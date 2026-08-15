import { prisma } from '@prospector/database';
import { MessageChannel, MessageDirection, MessageStatus } from '@prospector/types';
import { createLogger } from '@prospector/logger';

const logger = createLogger('worker.messages');

export interface CreateMessageInput {
  leadId: string;
  businessId: string;
  campaignId?: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  content: string;
  status?: MessageStatus;
  provider?: string | null;
  externalId?: string | null;
}

export async function createMessage(input: CreateMessageInput) {
  const message = await prisma.message.create({
    data: {
      lead_id: input.leadId,
      business_id: input.businessId,
      campaign_id: input.campaignId ?? null,
      channel: input.channel,
      direction: input.direction,
      content: input.content,
      status: input.status ?? 'QUEUED',
      provider: input.provider ?? null,
      external_id: input.externalId ?? null,
    },
  });
  logger.debug('Mensagem registrada', { message_id: message.id, channel: message.channel, direction: message.direction });
  return message;
}

export async function updateMessageStatus(messageId: string, status: MessageStatus, externalId?: string | null): Promise<void> {
  await prisma.message.update({
    where: { id: messageId },
    data: {
      status,
      ...(externalId !== undefined ? { external_id: externalId } : {}),
    },
  });
}

export async function markMessageFailed(messageId: string, reason: string): Promise<void> {
  await prisma.message.update({
    where: { id: messageId },
    data: { status: 'FAILED' },
  });
  logger.warn('Mensagem marcada como falha', { message_id: messageId, reason });
}
