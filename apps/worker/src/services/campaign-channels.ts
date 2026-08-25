import { renderMessageTemplate } from '@prospector/utils';

export type ChannelMode = 'WHATSAPP' | 'EMAIL' | 'BOTH';

export const CHANNEL_MODES: ChannelMode[] = ['WHATSAPP', 'EMAIL', 'BOTH'];

/**
 * Decide quais canais disparam para um lead, dado o modo da campanha,
 * os dados disponíveis do lead e a capacidade restante de cada canal.
 *
 * - WHATSAPP: só WhatsApp (pula lead sem telefone).
 * - EMAIL: só e-mail (pula lead sem e-mail).
 * - BOTH: cada canal independente — lead pode receber os dois, um, ou nenhum.
 */
export function resolveChannelDispatch(
  channelMode: ChannelMode,
  lead: { phone?: string | null; email?: string | null },
  capacity: { whatsapp: number; email: number }
): { whatsapp: boolean; email: boolean } {
  const hasPhone = Boolean(lead.phone);
  const hasEmail = Boolean(lead.email);

  if (channelMode === 'WHATSAPP') {
    return { whatsapp: hasPhone && capacity.whatsapp > 0, email: false };
  }
  if (channelMode === 'EMAIL') {
    return { whatsapp: false, email: hasEmail && capacity.email > 0 };
  }
  return {
    whatsapp: hasPhone && capacity.whatsapp > 0,
    email: hasEmail && capacity.email > 0,
  };
}

export interface CampaignEmailConfig {
  email_subject?: string | null;
  email_body?: string | null;
}

/**
 * Conteúdo de e-mail da campanha para um lead: usa SEMPRE o assunto/corpo
 * configurados pelo usuário, com variáveis {{nome}}, {{empresa}}, {{email}},
 * {{telefone}} renderizadas com os dados do lead.
 *
 * Retorna null quando a campanha não tem mensagem configurada — nesse caso
 * nenhum e-mail é disparado (campanhas antigas não começam a enviar e-mail
 * sozinhas; não existe mais mensagem fixa de fallback).
 */
export function resolveEmailContent(
  campaign: CampaignEmailConfig,
  lead: { name?: string | null; business_name?: string | null; email?: string | null; phone?: string | null }
): { subject: string; body: string } | null {
  const subject = campaign.email_subject?.trim();
  const body = campaign.email_body?.trim();
  if (!subject || !body) return null;
  return {
    subject: renderMessageTemplate(subject, lead),
    body: renderMessageTemplate(body, lead),
  };
}
