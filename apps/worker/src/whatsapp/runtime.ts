import { createLogger } from '@prospector/logger';
import { QUEUE_NAMES } from '@prospector/queues';
import { getWhatsAppManager, IncomingMessage } from '@prospector/whatsapp';
import { hasPersistentSession } from '@prospector/whatsapp';
import { prisma } from '@prospector/database';
import { getWorkerQueue } from '../queues';

const logger = createLogger('worker.whatsapp-runtime');

/** Aplica o ACK de entrega/leitura do WhatsApp na mensagem correspondente. */
export function setupAckTracking(businessId?: string): void {
  const manager = getWhatsAppManager(businessId);
  manager.on('ack', async ({ id, status }: { id: string; status: number }) => {
    try {
      const dbStatus = status >= 4 ? 'READ' : status === 3 ? 'DELIVERED' : status >= 2 ? 'SENT' : null;
      if (dbStatus) {
        const updated = await prisma.message.updateMany({
          where: { external_id: id, ...(businessId ? { business_id: businessId } : {}) },
          data: { status: dbStatus },
        });
        logger.info('ACK WhatsApp recebido', { external_id: id, business_id: businessId, wa_status: status, db_status: dbStatus, atualizado: updated.count });
      } else {
        logger.warn('ACK WhatsApp com status não mapeado', { external_id: id, business_id: businessId, wa_status: status });
      }
    } catch (error) {
      logger.warn('Falha ao aplicar ACK WhatsApp', { external_id: id, business_id: businessId, error });
    }
  });
}

/** Conecta o handler de mensagens recebidas à fila message-received. */
export function setupWhatsAppReceiver(businessId?: string): void {
  const manager = getWhatsAppManager(businessId);
  manager.setMessageHandler(async (message: IncomingMessage) => {
    try {
      await getWorkerQueue(QUEUE_NAMES.MESSAGE_RECEIVED).add(
        'received',
        {
          channel: 'WHATSAPP',
          content: message.content,
          from: message.fromPhone,
          remoteJid: message.remoteJid,
          externalId: message.messageId ?? undefined,
          businessId,
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
      );
      logger.debug('Mensagem recebida enfileirada', { from: message.fromPhone, business_id: businessId });
    } catch (error) {
      logger.error('Falha ao enfileirar mensagem recebida', { business_id: businessId, error });
    }
  });
}

/** Registra o callback getMessage usado pelo Baileys em fluxos de retry/prekey. */
export function setupGetMessage(businessId?: string): void {
  const manager = getWhatsAppManager(businessId);
  manager.setGetMessage(async (key: any) => {
    try {
      if (!key?.id) return undefined;
      const msg = await prisma.message.findFirst({
        where: { external_id: String(key.id), ...(businessId ? { business_id: businessId } : {}) },
        select: { content: true, channel: true },
      });
      if (!msg) return undefined;
      // reconstrói o proto para que o retry possa reenviar/descriptografar
      return { extendedTextMessage: { text: msg.content } };
    } catch (error) {
      logger.warn('Falha no getMessage', { key: String(key?.id ?? ''), business_id: businessId, error });
      return undefined;
    }
  });
}

/** Registra handlers e conecta uma conexão WhatsApp específica. */
async function setupAndConnect(businessId?: string): Promise<void> {
  const manager = getWhatsAppManager(businessId);
  manager.on('status', (status) => {
    logger.info('WhatsApp status alterado', { business_id: businessId, state: status.state, connected: status.connected });
  });
  manager.on('qr', () => {
    logger.info('QR code do WhatsApp gerado (aguardando leitura)', { business_id: businessId });
  });
  setupAckTracking(businessId);
  setupGetMessage(businessId);
  setupWhatsAppReceiver(businessId);

  const hasSession = await hasPersistentSession(businessId);
  if (hasSession) {
    logger.info('Sessão WhatsApp persistente encontrada; conectando automaticamente', { business_id: businessId });
    await manager.connect();
  } else {
    logger.info('Nenhuma sessão WhatsApp persistente. Use o painel para conectar via QR code.', { business_id: businessId });
  }
}

/** Inicia as conexões do WhatsApp no worker (empresa padrão + todas com sessão). */
export async function startWhatsAppRuntime(): Promise<void> {
  // Empresa padrão (backward-compat)
  await setupAndConnect(undefined);

  // Conexões por empresa com sessão persistente
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const b of businesses) {
    await setupAndConnect(b.id);
  }
}

export function getWhatsAppStatus(businessId?: string) {
  return getWhatsAppManager(businessId).getStatus();
}
