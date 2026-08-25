import { prisma } from '@prospector/database';
import { PLACEHOLDER_LEAD_NAMES } from '@prospector/utils';

export type InboxFilter = 'all' | 'sent' | 'responded' | 'manual' | 'closed';

export function buildFilterWhere(filter: string, businessId: string): Record<string, unknown> {
  switch (filter) {
    case 'sent':
      // "Em atendimento" — disparos enviados onde o cliente AINDA NÃO respondeu
      return {
        status: 'OPEN',
        business_id: businessId,
        human_handled: false,
        lead: {
          business_id: businessId,
          messages: { none: { direction: 'IN' } },
          status: { notIn: ['RESPONDED', 'INTERESTED', 'NOT_INTERESTED'] },
        },
      };
    case 'responded':
      // "Respondido" — clientes que já responderam
      return {
        status: 'OPEN',
        business_id: businessId,
        human_handled: false,
        lead: {
          business_id: businessId,
          OR: [
            { messages: { some: { direction: 'IN' } } },
            { status: { in: ['RESPONDED', 'INTERESTED', 'NOT_INTERESTED'] } },
          ],
        },
      };
    case 'manual':
      return { status: 'OPEN', business_id: businessId, human_handled: true };
    case 'closed':
      return { status: 'CLOSED', business_id: businessId };
    case 'all':
    default:
      return { status: 'OPEN', business_id: businessId };
  }
}




export async function listConversations(filter: InboxFilter, page = 1, pageSize = 20, businessId: string) {
  const where = buildFilterWhere(filter, businessId);
  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: { last_message_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            business_name: true,
            status: true,
            segment: true,
            lead_score: true,
          },
        },
      },
    }),
  ]);

  const leadIds = conversations.map((c) => c.lead_id);
  const recentMessages = leadIds.length
    ? await prisma.message.findMany({
        where: { lead_id: { in: leadIds }, business_id: businessId },
        orderBy: { created_at: 'desc' },
        take: Math.min(leadIds.length * 10, 500),
      })
    : [];

  const lastByLead = new Map<string, typeof recentMessages[number]>();
  for (const msg of recentMessages) {
    if (!lastByLead.has(msg.lead_id)) lastByLead.set(msg.lead_id, msg);
  }

  return {
    total,
    conversations: conversations.map((c) => {
      const last = lastByLead.get(c.lead_id) ?? null;
      return {
        id: c.id,
        lead_id: c.lead_id,
        status: c.status,
        ai_provider: c.ai_provider,
        human_handled: c.human_handled,
        last_message_at: c.last_message_at,
        created_at: c.created_at,
        updated_at: c.updated_at,
        lead_name: c.lead.name,
        lead_phone: c.lead.phone,
        lead_email: c.lead.email,
        business_name: c.lead.business_name,
        lead_segment: c.lead.segment,
        lead_score: c.lead.lead_score,
        lead_status: c.lead.status,
        last_message: last,
        last_message_preview: last?.content?.slice(0, 120) ?? null,
      };
    }),
  };
}

export async function getConversationDetail(conversationId: string, businessId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, business_id: businessId },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true, business_name: true, city: true, state: true, status: true } },
    },
  });
  if (!conversation) return null;

  const messages = await prisma.message.findMany({
    where: { lead_id: conversation.lead_id, business_id: businessId },
    orderBy: { created_at: 'asc' },
  });

  return { ...conversation, messages };
}

export async function findConversationByLeadId(leadId: string, businessId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { business_id: businessId, lead_id: leadId },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true, business_name: true, status: true } },
    },
  });
  if (!conversation) return null;
  const messages = await prisma.message.findMany({
    where: { lead_id: conversation.lead_id, business_id: businessId },
    orderBy: { created_at: 'asc' },
  });
  return { ...conversation, messages };
}
