export type WhatsAppConnectionState =
  | 'idle'
  | 'connecting'
  | 'waiting_for_qr'
  | 'connected'
  | 'closed'
  | 'logged_out'
  | 'error';

export interface WhatsAppStatus {
  connected: boolean;
  state: WhatsAppConnectionState;
  lastError: string | null;
  qrAvailable: boolean;
  qr: string | null;
  qrDataUrl: string | null;
  loggedIn: boolean;
  phone: string | null;
}

export interface IncomingMessage {
  fromPhone: string;
  /** JID completo normalizado (ex.: 5511978197645@s.whatsapp.net ou 1051...@lid) */
  remoteJid: string;
  content: string;
  messageId: string | null;
  timestamp: number;
  raw?: unknown;
}

/** Handler registrado para receber mensagens recebidas. */
export type MessageReceivedHandler = (message: IncomingMessage) => void | Promise<void>;
