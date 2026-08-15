/**
 * Handler padrão de mensagens recebidas: detecta opt-out por palavras-chave
 * e dispara o handler de negócio registrado. O registro/processamento real
 * (enfileirar, atualizar status) é feito pelo worker.
 */
import { createLogger } from '@prospector/logger';
import { IncomingMessage, MessageReceivedHandler } from '../types';
import { whatsappManager } from '../connection/manager';

const logger = createLogger('whatsapp.handler');

export interface MessageDispatchResult {
  handled: boolean;
  isOptOut: boolean;
}

export function createMessageDispatcher(handler: MessageReceivedHandler): MessageReceivedHandler {
  return async (message: IncomingMessage) => {
    logger.info('Mensagem recebida via WhatsApp', {
      from: message.fromPhone,
      chars: message.content.length,
      message_id: message.messageId ?? undefined,
    });
    await handler(message);
  };
}

export function getDefaultWhatsAppManager(): typeof whatsappManager {
  return whatsappManager;
}
