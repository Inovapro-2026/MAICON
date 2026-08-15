/**
 * Recepção de mensagens. Conecta o manager a um handler externo
 * (o worker registra o handler para enfileirar mensagens recebidas).
 */
import { whatsappManager } from '../connection/manager';
import { MessageReceivedHandler } from '../types';

export function registerMessageReceiver(handler: MessageReceivedHandler): void {
  whatsappManager.setMessageHandler(handler);
}
