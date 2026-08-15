import { CampaignStatus } from './enums';

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  daily_whatsapp_limit: number;
  daily_email_limit: number;
  interval_seconds: number;
  is_test: boolean;
  created_at: string;
  updated_at: string;
}

export interface CampaignLead {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  channel: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  total: number;
  processed: number;
  pending: number;
  sent: number;
  responded: number;
  interested: number;
  notInterested: number;
  optOut: number;
  errors: number;
  whatsappSentToday: number;
  emailSentToday: number;
  progressPercent: number;
}
