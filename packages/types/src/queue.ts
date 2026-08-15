/** Payloads das filas BullMQ. */

export interface LeadImportJob {
  importId: string;
  campaignId?: string;
  source: 'CSV' | 'PASTE' | 'XLSX' | 'TEST';
  filename?: string;
  /** Conteúdo cru (CSV) ou array de registros já parseados. */
  content?: string;
  records?: RawRecord[];
  isTest?: boolean;
}

export interface RawRecord {
  rowIndex: number;
  name?: string;
  phone?: string;
  email?: string;
  businessName?: string;
  city?: string;
  state?: string;
  externalId?: string;
}

export interface CampaignProcessingJob {
  campaignId: string;
  runId: string;
}

export interface WhatsAppSendJob {
  campaignLeadId?: string;
  leadId: string;
  campaignId?: string;
  phone: string;
  message: string;
  /** JID exato de destino (essencial para @lid); senão constrói @s.whatsapp.net */
  remoteJid?: string;
  messageId?: string;
  retryCount?: number;
}

export interface EmailSendJob {
  campaignLeadId: string;
  leadId: string;
  campaignId: string;
  email: string;
  message: string;
  subject: string;
}

export interface MessageReceivedJob {
  leadId: string;
  conversationId?: string;
  campaignId?: string;
  channel: 'WHATSAPP' | 'EMAIL';
  content: string;
  from: string;
  externalId?: string;
}

export interface AIResponseJob {
  conversationId: string;
  leadId: string;
  campaignId?: string;
  content: string;
}

export interface WebhookProcessingJob {
  provider: 'RESEND' | 'WHATSAPP';
  event: 'delivery' | 'open' | 'click' | 'bounce' | 'complaint' | 'message_in';
  payload: unknown;
}

export interface RetryJob {
  queue: string;
  jobName: string;
  payload: unknown;
  originalAttempts: number;
  reason: string;
}

export interface DelayedCampaignJob {
  campaignId: string;
  runId: string;
}
