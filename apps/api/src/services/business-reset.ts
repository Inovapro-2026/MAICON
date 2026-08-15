/**
 * Reset de conta por EMPRESA (business_id) — usado por /admin/businesses/:id/reset.
 *
 * DIFERENÇA do scripts/clean-db.mjs (global): aqui a limpeza é escopada a UMA
 * empresa. Preserva User/Login, Business, membros, assinatura e pagamentos —
 * apenas os DADOS operacionais da empresa são apagados.
 *
 * A sessão do WhatsApp e as filas do Redis são tratadas pela rota (worker + BullMQ);
 * este serviço cuida exclusivamente do banco, com deps injetáveis p/ testes.
 */
import { prisma, PrismaClient } from "@prospector/database";

export interface ResetCounts {
  leads: number;
  campaigns: number;
  conversations: number;
  messages: number;
  opt_outs: number;
  ai_generations: number;
  delivery_events: number;
  email_logs: number;
  import_logs: number;
  prospections: number;
  campaign_links: number;
}

export interface ResetBusinessDeps {
  db?: PrismaClient;
}

function resolveDb(deps?: ResetBusinessDeps): PrismaClient {
  return deps?.db ?? prisma;
}

/**
 * Apaga os dados operacionais de UMA empresa dentro de uma transação.
 * Retorna os contadores do que foi removido (para confirmação visual/auditoria).
 */
export async function resetBusinessData(
  businessId: string,
  deps?: ResetBusinessDeps,
): Promise<ResetCounts> {
  const db = resolveDb(deps);
  const scope = { business_id: businessId };

  const counts = {
    leads: await db.lead.count({ where: scope }),
    campaigns: await db.campaign.count({ where: scope }),
    conversations: await db.conversation.count({ where: scope }),
    messages: await db.message.count({ where: scope }),
    opt_outs: await db.optOut.count({ where: scope }),
    ai_generations: await db.aIGeneration.count({ where: scope }),
    delivery_events: await db.deliveryEvent.count({ where: scope }),
    email_logs: await db.emailLog.count({ where: scope }),
    import_logs: await db.leadImport.count({ where: scope }),
    prospections: await db.prospectionRun.count({ where: scope }),
    campaign_links: await db.campaignLead.count({ where: scope }),
  };

  await db.$transaction([
    db.campaignLead.deleteMany({ where: scope }),
    db.aIGeneration.deleteMany({ where: scope }),
    db.optOut.deleteMany({ where: scope }),
    db.deliveryEvent.deleteMany({ where: scope }),
    db.emailLog.deleteMany({ where: scope }),
    db.message.deleteMany({ where: scope }),
    db.conversation.deleteMany({ where: scope }),
    db.lead.deleteMany({ where: scope }),
    db.prospectionRun.deleteMany({ where: scope }),
    db.leadImport.deleteMany({ where: scope }),
    db.campaign.deleteMany({ where: scope }),
    db.usage.deleteMany({ where: scope }),
  ]);

  return counts;
}
