export const LeadStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  RESPONDED: 'RESPONDED',
  AGENT_ACTIVE: 'AGENT_ACTIVE',
  INTERESTED: 'INTERESTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  OPT_OUT: 'OPT_OUT',
  ERROR: 'ERROR',
} as const;

export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const CampaignStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
} as const;

export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const MessageChannel = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
} as const;

export type MessageChannel = (typeof MessageChannel)[keyof typeof MessageChannel];

export const MessageDirection = {
  IN: 'IN',
  OUT: 'OUT',
} as const;

export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];

export const MessageStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
} as const;

export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const ConversationStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const LeadSource = {
  CSV: 'CSV',
  MANUAL: 'MANUAL',
  TEST: 'TEST',
  WEB: 'WEB',
  WHATSAPP_GROUP: 'WHATSAPP_GROUP',
} as const;

export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const OptOutChannel = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
} as const;

export type OptOutChannel = (typeof OptOutChannel)[keyof typeof OptOutChannel];

export const ImportStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;

export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const ImportRowStatus = {
  VALID: 'VALID',
  DUPLICATE: 'DUPLICATE',
  INVALID: 'INVALID',
  NEW: 'NEW',
} as const;

export type ImportRowStatus = (typeof ImportRowStatus)[keyof typeof ImportRowStatus];
