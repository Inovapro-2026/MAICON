import { prisma } from '@prospector/database';
import { createLogger } from '@prospector/logger';

const logger = createLogger('worker.leads');

/** Converte número bruto (dígitos) em fingerprint E.164 para lookup. */
export function fingerprintFromDigits(digits: string): string {
  const cleaned = digits.replace(/\D/g, '');
  // Já com código de país do Brasil (55 + DDD + número)
  if (cleaned.length >= 12 && cleaned.startsWith('55')) return `+${cleaned}`;
  // Sem código de país (DDD + número) → assume Brasil
  if (cleaned.length === 10 || cleaned.length === 11) return `+55${cleaned}`;
  // Números incomuns/estrangeiros: usa como vieram (apenas adiciona o +)
  return `+${cleaned}`;
}

/** Localiza um lead por número de telefone (fingerprint). */
export async function resolveLeadByPhone(digits: string, businessId: string): Promise<{ id: string; phone: string | null; email: string | null; status: string } | null> {
  const fp = fingerprintFromDigits(digits);
  const lead = await prisma.lead.findFirst({ where: { business_id: businessId, fingerprint_phone: fp } });
  if (lead) return { id: lead.id, phone: lead.phone, email: lead.email, status: lead.status };
  return null;
}

/**
 * Localiza um lead por telefone; se não existir, cria um novo automaticamente
 * (a IA responde a qualquer número que contatar, registrando o lead).
 */
export async function resolveOrCreateLeadByPhone(digits: string, businessId: string): Promise<{ id: string; phone: string | null; email: string | null; status: string }> {
  const fp = fingerprintFromDigits(digits);
  const existing = await prisma.lead.findFirst({ where: { business_id: businessId, fingerprint_phone: fp } });
  if (existing) {
    return { id: existing.id, phone: existing.phone, email: existing.email, status: existing.status };
  }
  // upsert para evitar corrida de criação para o mesmo número
  const lead = await prisma.lead.upsert({
    where: { business_id_fingerprint_phone: { business_id: businessId, fingerprint_phone: fp } },
    create: {
      business_id: businessId,
      name: 'Novo contato',
      phone: fp,
      fingerprint_phone: fp,
      source: 'MANUAL',
      status: 'PENDING',
    },
    update: {},
  });
  logger.info('Lead criado automaticamente (mensagem recebida de número desconhecido)', {
    lead_id: lead.id,
    phone: fp,
    business_id: businessId,
  });
  return { id: lead.id, phone: lead.phone, email: lead.email, status: lead.status };
}

/** Localiza um lead por e-mail. */
export async function resolveLeadByEmail(email: string, businessId: string): Promise<{ id: string; phone: string | null; email: string | null; status: string } | null> {
  const normalized = email.toLowerCase().trim();
  const lead = await prisma.lead.findFirst({
    where: { business_id: businessId, fingerprint_email: normalized },
  });
  if (lead) return { id: lead.id, phone: lead.phone, email: lead.email, status: lead.status };
  return null;
}

/**
 * Localiza um lead por e-mail; se não existir, cria um novo automaticamente.
 */
export async function resolveOrCreateLeadByEmail(email: string, businessId: string): Promise<{ id: string; phone: string | null; email: string | null; status: string }> {
  const normalized = email.toLowerCase().trim();
  const existing = await prisma.lead.findFirst({ where: { business_id: businessId, fingerprint_email: normalized } });
  if (existing) {
    return { id: existing.id, phone: existing.phone, email: existing.email, status: existing.status };
  }
  const lead = await prisma.lead.upsert({
    where: { business_id_fingerprint_email: { business_id: businessId, fingerprint_email: normalized } },
    create: {
      business_id: businessId,
      name: 'Novo contato',
      email: normalized,
      fingerprint_email: normalized,
      source: 'MANUAL',
      status: 'PENDING',
    },
    update: {},
  });
  logger.info('Lead criado automaticamente (mensagem recebida de e-mail desconhecido)', {
    lead_id: lead.id,
    email: normalized,
    business_id: businessId,
  });
  return { id: lead.id, phone: lead.phone, email: lead.email, status: lead.status };
}

export async function isOptedOut(leadId: string, businessId: string): Promise<boolean> {
  const count = await prisma.optOut.count({ where: { lead_id: leadId, business_id: businessId } });
  return count > 0;
}

export async function registerOptOut(leadId: string, channel: 'WHATSAPP' | 'EMAIL', reason: string | undefined, businessId: string): Promise<void> {
  const exists = await prisma.optOut.findFirst({
    where: { lead_id: leadId, channel, business_id: businessId },
  });
  if (!exists) {
    await prisma.optOut.create({
      data: {
        lead_id: leadId,
        channel,
        reason: reason ?? 'Solicitado pelo contato',
        business_id: businessId,
      },
    });
    logger.info('Opt-out registrado', { lead_id: leadId, channel, reason, business_id: businessId });
  }
  await prisma.lead.update({ where: { id: leadId }, data: { status: 'OPT_OUT' } });
  await prisma.campaignLead.updateMany({
    where: { lead_id: leadId, business_id: businessId },
    data: { status: 'OPT_OUT' },
  });
}
