import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { MessageStatus } from '@prospector/types';
import { updateMessageStatus } from '../services/messages';

const logger = createLogger('worker.webhook');

interface WebhookData {
  provider: 'RESEND' | 'WHATSAPP';
  event: 'delivery' | 'open' | 'click' | 'bounce' | 'complaint' | 'message_in' | 'sent' | 'unknown';
  payload: unknown;
  businessId?: string;
}

export async function processWebhook(job: { id?: string; data: WebhookData }): Promise<void> {
  const { provider, event, payload, businessId } = job.data;

  if (provider === 'RESEND') {
    const data = (payload ?? {}) as Record<string, unknown>;
    const externalId = (data as Record<string, unknown>).email_id as string | undefined;

    if (!externalId) {
      logger.debug('Webhook Resend sem email_id', { event });
      return;
    }

    const message = businessId
      ? await prisma.message.findFirst({
          where: { external_id: externalId, business_id: businessId },
        })
      : await prisma.message.findFirst({
          where: { external_id: externalId },
        });

    if (!message) {
      logger.info('Webhook Resend para e-mail desconhecido', { event, external_id: externalId });
      return;
    }

    let status: MessageStatus | null = null;
    switch (event) {
      case 'delivery':
      case 'open':
      case 'click':
      case 'sent':
        status = 'DELIVERED';
        break;
      case 'bounce':
      case 'complaint':
        status = 'FAILED';
        break;
      default:
        break;
    }

    if (status) {
      await updateMessageStatus(message.id, status);
      logger.info('Webhook Resend aplicado à mensagem', {
        message_id: message.id,
        event,
        status,
      });
    }

    // Complaint = reclamação de spam -> registra opt-out
    if (event === 'complaint') {
      const exists = await prisma.optOut.findFirst({
        where: { lead_id: message.lead_id, channel: 'EMAIL', business_id: message.business_id },
      });
      if (!exists) {
        await prisma.optOut.create({
          data: {
            lead_id: message.lead_id,
            channel: 'EMAIL',
            reason: 'Complaint/denúncia de spam via Resend',
            business_id: message.business_id,
          },
        });
        await prisma.lead.update({ where: { id: message.lead_id }, data: { status: 'OPT_OUT' } });
        logger.warn('Opt-out registrado por complaint', { lead_id: message.lead_id, business_id: message.business_id });
      }
    }
  } else {
    logger.debug('Webhook WhatsApp não processado (reservado)', { event });
  }
}
