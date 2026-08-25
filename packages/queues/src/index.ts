export const QUEUE_NAMES = {
  LEAD_IMPORT: "lead-import",
  CAMPAIGN_PROCESSING: "campaign-processing",
  WHATSAPP_SEND: "whatsapp-send",
  EMAIL_SEND: "email-send",
  MESSAGE_RECEIVED: "message-received",
  AI_RESPONSE: "ai-response",
  CONVERSATION_LEARNING: "conversation-learning",
  WEBHOOK_PROCESSING: "webhook-processing",
  PROSPECTION: "prospection",
  LEAD_ENRICHMENT: "lead-enrichment",
  RETRY: "retry",
  DEAD_LETTER: "dead-letter",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUES: QueueName[] = Object.values(QUEUE_NAMES);
