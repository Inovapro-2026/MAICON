import { prisma } from '@prospector/database';
import { DashboardMetrics } from '@prospector/types';
import { startOfBrasiliaDay, startOfBrasiliaMonth } from '@prospector/utils';
import { getBusinessSettingInt } from '../services/settings';

export async function getDashboardMetrics(businessId: string): Promise<DashboardMetrics> {
  const today = startOfBrasiliaDay(new Date());
  const month = startOfBrasiliaMonth(new Date());

  const [
    leadsAvailable,
    leadsImported,
    messagesToday,
    messagesMonth,
    responsesToday,
    responsesMonth,
    interested,
    notInterested,
    optOuts,
    errors,
    activeCampaigns,
  ] = await Promise.all([
    prisma.lead.count({ where: { status: 'PENDING', business_id: businessId } }),
    prisma.lead.count({ where: { business_id: businessId } }),
    prisma.message.count({
      where: { direction: 'OUT', business_id: businessId, created_at: { gte: today }, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
    }),
    prisma.message.count({
      where: { direction: 'OUT', business_id: businessId, created_at: { gte: month }, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
    }),
    prisma.message.count({
      where: { direction: 'IN', business_id: businessId, created_at: { gte: today } },
    }),
    prisma.message.count({
      where: { direction: 'IN', business_id: businessId, created_at: { gte: month } },
    }),
    prisma.lead.count({ where: { status: 'INTERESTED', business_id: businessId } }),
    prisma.lead.count({ where: { status: 'NOT_INTERESTED', business_id: businessId } }),
    prisma.optOut.count({ where: { business_id: businessId } }),
    prisma.lead.count({ where: { status: 'ERROR', business_id: businessId } }),
    prisma.campaign.count({ where: { status: 'ACTIVE', business_id: businessId } }),
  ]);

  const [whatsappToday, emailToday, whatsappMonth, emailMonth] = await Promise.all([
    prisma.message.count({
      where: { channel: 'WHATSAPP', direction: 'OUT', business_id: businessId, created_at: { gte: today }, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
    }),
    prisma.message.count({
      where: { channel: 'EMAIL', direction: 'OUT', business_id: businessId, created_at: { gte: today }, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
    }),
    prisma.message.count({
      where: { channel: 'WHATSAPP', direction: 'OUT', business_id: businessId, created_at: { gte: month }, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
    }),
    prisma.message.count({
      where: { channel: 'EMAIL', direction: 'OUT', business_id: businessId, created_at: { gte: month }, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
    }),
  ]);

  const whatsappLimit = await getBusinessSettingInt(businessId, 'whatsapp_daily_limit', 30);
  const emailLimit = await getBusinessSettingInt(businessId, 'email_daily_limit', 100);

  return {
    leads_available: leadsAvailable,
    leads_imported: leadsImported,
    messages_sent_today: messagesToday,
    emails_sent_today: emailToday,
    whatsapp_sent_today: whatsappToday,
    messages_sent_month: messagesMonth,
    emails_sent_month: emailMonth,
    whatsapp_sent_month: whatsappMonth,
    responses_received: responsesToday,
    responses_received_month: responsesMonth,
    interested,
    not_interested: notInterested,
    opt_outs: optOuts,
    errors,
    active_campaigns: activeCampaigns,
    today_activity: {
      whatsapp: { used: whatsappToday, limit: whatsappLimit },
      email: { used: emailToday, limit: emailLimit },
    },
  };
}
