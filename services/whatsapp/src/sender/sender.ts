/**
 * Envio de mensagens WhatsApp. Wrapper sobre o WhatsAppManager.
 */
import { createLogger } from '@prospector/logger';
import { whatsappManager } from '../connection/manager';

const logger = createLogger('whatsapp.sender');

export interface SendResult {
  ok: boolean;
  messageId: string | null;
  error?: string;
}

/** Envia uma mensagem de texto e retorna o id. Lança em caso de falha. */
export async function sendWhatsAppMessage(phoneE164: string, text: string, remoteJid?: string): Promise<string | null> {
  const id = await whatsappManager.sendText(phoneE164, text, remoteJid);
  return id;
}

/** Versão segura para workers: nunca lança, retorna resultado. */
export async function trySendWhatsAppMessage(phoneE164: string, text: string, remoteJid?: string): Promise<SendResult> {
  try {
    const id = await sendWhatsAppMessage(phoneE164, text, remoteJid);
    return { ok: true, messageId: id };
  } catch (error) {
    logger.error('Falha ao enviar mensagem WhatsApp', {
      to: phoneE164,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, messageId: null, error: error instanceof Error ? error.message : String(error) };
  }
}
