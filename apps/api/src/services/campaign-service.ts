import { prisma } from '@prospector/database';
import { CampaignStats } from '@prospector/types';
import { startOfBrasiliaDay } from '@prospector/utils';

export async function getCampaignStats(campaignId: string, businessId: string): Promise<CampaignStats> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, business_id: businessId },
    select: { created_at: true },
  });

  const [cl, messagesToday, respondedRows] = await Promise.all([
    prisma.campaignLead.groupBy({
      by: ['status'],
      where: { campaign_id: campaignId, business_id: businessId },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ['channel'],
      where: {
        campaign_id: campaignId,
        business_id: businessId,
        direction: 'OUT',
        created_at: { gte: startOfBrasiliaDay(new Date()) },
        status: { in: ['SENT', 'DELIVERED', 'READ'] },
      },
      _count: { _all: true },
    }),
    // "Respondeu" é cumulativo (≥1 mensagem recebida do lead desde o início da
    // campanha) — o estado RESPONDED do funil é transitório: a IA sobrescreve
    // para AGENT_ACTIVE/INTERESTED ao responder, o que zerava o contador.
    // Mesma fonte de verdade de /reports e /clientes (Message direction IN).
    prisma.message.groupBy({
      by: ['lead_id'],
      where: {
        direction: 'IN',
        business_id: businessId,
        created_at: { gte: campaign?.created_at ?? new Date(0) },
        lead: { campaign_leads: { some: { campaign_id: campaignId, business_id: businessId } } },
      },
      _count: { _all: true },
    }),
  ]);

  const countOf = (status: string): number => cl.find((r) => r.status === status)?._count._all ?? 0;

  const whatsappSentToday = messagesToday.find((m) => m.channel === 'WHATSAPP')?._count._all ?? 0;
  const emailSentToday = messagesToday.find((m) => m.channel === 'EMAIL')?._count._all ?? 0;

  const total = countOf('PENDING') + countOf('PROCESSING') + countOf('SENT') + countOf('RESPONDED') + countOf('AGENT_ACTIVE') + countOf('INTERESTED') + countOf('NOT_INTERESTED') + countOf('OPT_OUT') + countOf('ERROR');
  const processed = total - countOf('PENDING');

  return {
    total,
    processed,
    pending: countOf('PENDING'),
    sent: countOf('SENT'),
    responded: respondedRows.length,
    interested: countOf('INTERESTED'),
    notInterested: countOf('NOT_INTERESTED'),
    optOut: countOf('OPT_OUT'),
    errors: countOf('ERROR'),
    whatsappSentToday,
    emailSentToday,
    progressPercent: total > 0 ? Math.round((processed / total) * 100) : 0,
  };
}
