import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { getWhatsAppManager } from '@prospector/whatsapp';
import { getWorkerQueue } from '../queues';
import { createMessage, markMessageFailed, updateMessageStatus } from '../services/messages';
import { ensureConversation, touchConversation } from '../services/conversations';

const logger = createLogger('worker.whatsapp-send');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 15000;

interface WhatsAppSendData {
  campaignLeadId?: string;
  leadId: string;
  campaignId?: string;
  businessId?: string;
  phone: string;
  message: string;
  remoteJid?: string;
  messageId?: string;
  retryCount?: number;
}

export async function processWhatsAppSend(job: { id?: string; data: WhatsAppSendData }): Promise<void> {
  const { leadId, campaignId, businessId, phone, message } = job.data;
  const retryCount = job.data.retryCount ?? 0;
  const remoteJid = job.data.remoteJid;

  let messageId = job.data.messageId;
  if (!messageId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { business_id: true } });
    const created = await createMessage({
      leadId,
      businessId: businessId ?? lead?.business_id ?? 'default',
      campaignId,
      channel: 'WHATSAPP',
      direction: 'OUT',
      content: message,
      status: 'QUEUED',
      provider: 'whatsapp',
    });
    messageId = created.id;
  }

  // IDEMPOTÊNCIA DE ENVIO:
  // 1) Se a mensagem já foi entregue (SENT/DELIVERED/READ), não envia de novo.
  //    Protege contra retry após confirmação perdida (evita duplicar no WhatsApp).
  const existing = await prisma.message.findUnique({ where: { id: messageId }, select: { status: true } });
  if (existing && ['SENT', 'DELIVERED', 'READ'].includes(existing.status)) {
    logger.info('Mensagem já enviada; reenvio ignorado', { message_id: messageId, status: existing.status });
    return;
  }

  // 2) Claim atômico: QUEUED -> PROCESSING. Se outro worker/ciclo já reivindicou,
  //    este envia 0 linhas e sai (garante envio único sob concorrência).
  if (existing && existing.status !== 'QUEUED' && existing.status !== 'PROCESSING') {
    logger.info('Mensagem em estado não enviável; ignorada', { message_id: messageId, status: existing.status });
    return;
  }
  const claimed = await prisma.message.updateMany({
    where: { id: messageId, status: 'QUEUED' },
    data: { status: 'PROCESSING' },
  });
  if (claimed.count === 0 && existing?.status === 'PROCESSING') {
    // Já reivindicada por outro processamento ativo — não duplica.
    return;
  }

  const waManager = getWhatsAppManager(businessId);
  if (!waManager.isConnected()) {
    logger.warn('WhatsApp não conectado; retentando', { lead_id: leadId, phone, retry: retryCount });
    await handleFailure(job.data, messageId, 'WhatsApp não conectado');
    return;
  }

  try {
    const externalId = await waManager.sendText(phone, message, remoteJid);
    await updateMessageStatus(messageId, 'DELIVERED', externalId);



    // Garante que a conversa existe e aparece no Inbox ("Em atendimento")
    const conversationId = await ensureConversation(leadId, businessId ?? 'default');
    await touchConversation(conversationId, businessId);

    // Só marca como SENT se ainda estiver no início do funil (primeiro contato).
    // Respostas de IA/conversa ativa mantêm o status definido pelo agente.
    await prisma.campaignLead.updateMany({
      where: { lead_id: leadId, ...(businessId ? { business_id: businessId } : {}), status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'SENT' },
    });
    await prisma.lead.updateMany({
      where: { id: leadId, business_id: businessId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'SENT' },
    });
    logger.info('Mensagem WhatsApp enviada', { lead_id: leadId, phone, message_id: messageId });

  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error('Falha no envio WhatsApp', { lead_id: leadId, phone, reason });
    await handleFailure(job.data, messageId, reason);
  }
}

async function handleFailure(data: WhatsAppSendData, messageId: string, reason: string): Promise<void> {
  const retryCount = data.retryCount ?? 0;

  if (retryCount < MAX_RETRIES - 1) {
    // Devolve a mensagem para QUEUED para que o retry possa reivindicá-la de novo
    await prisma.message.updateMany({ where: { id: messageId }, data: { status: 'QUEUED' } });
    await getWorkerQueue(QUEUE_NAMES.RETRY).add(
      'retry',
      {
        queue: QUEUE_NAMES.WHATSAPP_SEND,
        payload: { ...data, retryCount: retryCount + 1, messageId },
        reason,
        originalAttempts: retryCount + 1,
      },
      { delay: RETRY_DELAY_MS, attempts: 1, removeOnComplete: true }
    );
    logger.warn('Envio WhatsApp agendado para retry', { lead_id: data.leadId, attempt: retryCount + 1, reason });
    return;
  }

  // Esgotou tentativas -> dead letter
  await getWorkerQueue(QUEUE_NAMES.DEAD_LETTER).add(
    'dead',
    { queue: QUEUE_NAMES.WHATSAPP_SEND, payload: data, reason },
    { attempts: 1, removeOnComplete: true }
  );
  await markMessageFailed(messageId, reason);
  await prisma.campaignLead.updateMany({
    where: { lead_id: data.leadId, ...(data.businessId ? { business_id: data.businessId } : {}) },
    data: { status: 'ERROR' },
  });
  await prisma.lead.update({ where: { id: data.leadId }, data: { status: 'ERROR' } });
  logger.error('Envio WhatsApp em DEAD_LETTER', { lead_id: data.leadId, reason });
}
