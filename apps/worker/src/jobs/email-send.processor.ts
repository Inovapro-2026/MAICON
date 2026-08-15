import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { resendService } from '@prospector/email';
import { getWorkerQueue } from '../queues';
import { createMessage, markMessageFailed, updateMessageStatus } from '../services/messages';

const logger = createLogger('worker.email-send');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 15000;

interface EmailSendData {
  campaignLeadId?: string;
  leadId: string;
  campaignId?: string;
  businessId?: string;
  email: string;
  message: string;
  subject: string;
  messageId?: string;
  retryCount?: number;
}

export async function processEmailSend(job: { id?: string; data: EmailSendData }): Promise<void> {
  const { leadId, campaignId, businessId, email, message, subject } = job.data;
  const retryCount = job.data.retryCount ?? 0;

  let messageId = job.data.messageId;
  if (!messageId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { business_id: true } });
    const created = await createMessage({
      leadId,
      businessId: businessId ?? lead?.business_id ?? 'default',
      campaignId,
      channel: 'EMAIL',
      direction: 'OUT',
      content: message,
      status: 'QUEUED',
      provider: 'resend',
    });
    messageId = created.id;
  }

  // IDEMPOTÊNCIA DE ENVIO (mesmo padrão do WhatsApp)
  const existing = await prisma.message.findUnique({ where: { id: messageId }, select: { status: true } });
  if (existing && ['SENT', 'DELIVERED', 'READ'].includes(existing.status)) {
    logger.info('E-mail já enviado; reenvio ignorado', { message_id: messageId, status: existing.status });
    return;
  }
  if (existing && existing.status !== 'QUEUED' && existing.status !== 'PROCESSING') {
    logger.info('E-mail em estado não enviável; ignorado', { message_id: messageId, status: existing.status });
    return;
  }
  const claimed = await prisma.message.updateMany({
    where: { id: messageId, status: 'QUEUED' },
    data: { status: 'PROCESSING' },
  });
  if (claimed.count === 0 && existing?.status === 'PROCESSING') {
    return;
  }

  try {
    const result = await resendService.send({
      to: email,
      subject,
      text: message,
    });
    await updateMessageStatus(messageId, 'SENT', result.id);
    // Só marca como SENT se ainda estiver no início do funil (primeiro contato)
    await prisma.campaignLead.updateMany({
      where: { lead_id: leadId, ...(businessId ? { business_id: businessId } : {}), status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'SENT' },
    });
    await prisma.lead.updateMany({
      where: { id: leadId, business_id: businessId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'SENT' },
    });
    await logEmail(businessId, { to: email, subject, status: 'SENT', providerMessageId: result.id, campaignId, error: null });
    logger.info('E-mail enviado', { lead_id: leadId, email, message_id: messageId, external_id: result.id });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error('Falha no envio de e-mail', { lead_id: leadId, email, reason });

    if (retryCount < MAX_RETRIES - 1) {
      await prisma.message.updateMany({ where: { id: messageId }, data: { status: 'QUEUED' } });
      await getWorkerQueue(QUEUE_NAMES.RETRY).add(
        'retry',
        {
          queue: QUEUE_NAMES.EMAIL_SEND,
          payload: { ...job.data, retryCount: retryCount + 1, messageId },
          reason,
          originalAttempts: retryCount + 1,
        },
        { delay: RETRY_DELAY_MS, attempts: 1, removeOnComplete: true }
      );
      return;
    }

    await getWorkerQueue(QUEUE_NAMES.DEAD_LETTER).add(
      'dead',
      { queue: QUEUE_NAMES.EMAIL_SEND, payload: job.data, reason },
      { attempts: 1, removeOnComplete: true }
    );
    await markMessageFailed(messageId, reason);
    await prisma.campaignLead.updateMany({
      where: { lead_id: leadId, ...(businessId ? { business_id: businessId } : {}) },
      data: { status: 'ERROR' },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'ERROR' } });
    await logEmail(businessId, { to: email, subject, status: 'FAILED', providerMessageId: null, campaignId, error: reason });
  }
}

/**
 * Registra o envio/falha no EmailLog (best-effort — nunca derruba o job).
 * Só registra quando há businessId: e-mails fora de contexto de empresa
 * (ex.: OTP de cadastro) não possuem tenant e ficam fora do histórico.
 */
async function logEmail(
  businessId: string | undefined,
  input: {
    to: string;
    subject: string;
    status: 'SENT' | 'FAILED';
    providerMessageId: string | null;
    campaignId?: string;
    error: string | null;
  }
): Promise<void> {
  if (!businessId) return;
  try {
    await prisma.emailLog.create({
      data: {
        business_id: businessId,
        to: input.to,
        subject: input.subject,
        status: input.status,
        provider_message_id: input.providerMessageId ?? undefined,
        related_campaign_id: input.campaignId ?? undefined,
        error: input.error ?? undefined,
      },
    });
  } catch (error) {
    logger.error('Falha ao registrar EmailLog', { business_id: businessId, error });
  }
}
