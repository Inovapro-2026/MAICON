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

  // Valida se o número é usuário registrado do WhatsApp. Números não registrados
  // (fixos/inexistentes) até produzem echo fromMe=true, mas NADA chega ao
  // destinatário — por isso o painel mostrava "Enviado" sem entrega real.
  // Tri-estado: false = NÃO envia; true = envia; null = indeterminado → retry.
  const registration = await waManager.checkWhatsAppRegistration(phone);
  if (registration === false) {
    logger.warn('Número não é usuário do WhatsApp; envio marcado como erro', { lead_id: leadId, phone });
    await markMessageFailed(messageId, 'Número não registrado no WhatsApp');
    await prisma.campaignLead.updateMany({
      where: { lead_id: leadId, ...(businessId ? { business_id: businessId } : {}) },
      data: { status: 'ERROR' },
    });
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'ERROR' } });
    return;
  }
  if (registration === null) {
    // Diretório do WhatsApp indisponível (rede/servidor). NÃO marca como enviado:
    // reenfileira para tentar de novo; se esgotar, vai para ERROR (dead letter).
    logger.warn('Falha ao confirmar número no WhatsApp; retentando', { lead_id: leadId, phone });
    await handleFailure(job.data, messageId, 'Falha ao confirmar número no diretório WhatsApp');
    return;
  }

  try {
    const externalId = await waManager.sendText(phone, message, remoteJid);
    // SENT = aceita pelo SERVIDOR WhatsApp (SERVER_ACK). Entrega real ao aparelho
    // (DELIVERY_ACK) chega assíncrona via messages.update (runtime.ts) — e só
    // quando essa confirmação chega o CampaignLead é promovido para SENT. Isso
    // evita o falso "Enviado" de números inválidos/bloqueados sem entrega.
    await updateMessageStatus(messageId, 'SENT', externalId);



    // Garante que a conversa existe e aparece no Inbox ("Em atendimento")
    const conversationId = await ensureConversation(leadId, businessId ?? 'default');
    await touchConversation(conversationId, businessId);

    // NÃO marca o CampaignLead/Lead como SENT aqui: o lead permanece em
    // PROCESSING até o DELIVERY_ACK (runtime.ts) ou a reconciliação do watchdog
    // resolver envios sem confirmação.
    logger.info('Mensagem WhatsApp aceita pelo servidor; aguardando ACK de entrega', {
      lead_id: leadId,
      phone,
      message_id: messageId,
      external_id: externalId,
    });

  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error('Falha no envio WhatsApp', { lead_id: leadId, phone, reason });
    await handleFailure(job.data, messageId, reason);
  }
}

async function handleFailure(data: WhatsAppSendData, messageId: string, reason: string): Promise<void> {
  const retryCount = data.retryCount ?? 0;

  // Se a mensagem já foi aceita pelo servidor (SENT/DELIVERED/READ), não
  // reenfileira: evita duplicar envio após confirmação perdida.
  const current = await prisma.message.findUnique({ where: { id: messageId }, select: { status: true } });
  if (current && ['SENT', 'DELIVERED', 'READ'].includes(current.status)) {
    logger.info('Mensagem já aceita pelo servidor; retry ignorado', { message_id: messageId, status: current.status });
    return;
  }

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
