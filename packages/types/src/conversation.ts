import { ConversationStatus } from './enums';
import { Message } from './message';

export interface Conversation {
  id: string;
  lead_id: string;
  status: ConversationStatus;
  ai_provider: string | null;
  /** true quando um humano assumiu o atendimento */
  human_handled: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithMessages extends Conversation {
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  business_name: string | null;
  messages: Message[];
  last_message: Message | null;
  last_message_preview: string | null;
}
