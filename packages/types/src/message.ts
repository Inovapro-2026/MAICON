import { MessageChannel, MessageDirection, MessageStatus } from './enums';

export interface Message {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  content: string;
  status: MessageStatus;
  provider: string | null;
  external_id: string | null;
  created_at: string;
}
