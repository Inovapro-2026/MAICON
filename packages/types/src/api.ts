import { ImportSummary } from './lead';
import { CampaignStats } from './campaign';
import { ConversationWithMessages } from './conversation';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ImportPreviewResponse extends ImportSummary {
  importId: string;
  filename: string;
}

export interface ImportConfirmResponse {
  importId: string;
  queued: number;
  duplicates: number;
  invalid: number;
}

export interface DashboardMetrics {
  leads_available: number;
  leads_imported: number;
  messages_sent_today: number;
  emails_sent_today: number;
  whatsapp_sent_today: number;
  responses_received: number;
  interested: number;
  not_interested: number;
  opt_outs: number;
  errors: number;
  active_campaigns: number;
  today_activity: {
    whatsapp: { used: number; limit: number };
    email: { used: number; limit: number };
  };
}

export interface ConversationListResponse {
  conversations: ConversationWithMessages[];
  total: number;
}

export interface CampaignDetailResponse {
  campaign: unknown;
  stats: CampaignStats;
}

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface ReportMetrics {
  period: ReportPeriod;
  response_rate: number;
  interest_rate: number;
  conversion_rate: number;
  opt_out_rate: number;
  total_sent: number;
  total_responded: number;
  total_interested: number;
  total_opt_out: number;
  series: {
    date: string;
    sent: number;
    responded: number;
    interested: number;
  }[];
}
