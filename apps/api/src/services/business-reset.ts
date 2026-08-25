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

export interface DeleteBusinessCounts extends ResetCounts {
  members: number;
  business_settings: number;
  ai_settings: number;
  ai_agents: number;
  ai_knowledge: number;
  memory: number;
  subscriptions: number;
  users_deleted: number;
}

/**
 * Exclui DEFINITIVAMENTE um tenant (Business) e TUDO relacionado do banco.
 * Ação irreversível, restrita a PLATFORM_ADMIN. Após remover os vínculos,
 * contas de usuário que ficaram órfãs (sem vínculo e não staff/plataforma)
 * também são removidas — "apagar conta e remover do db".
 * AuditLog é preservado por design (imutável).
 */
export async function deleteBusinessData(
  businessId: string,
  deps?: ResetBusinessDeps,
): Promise<DeleteBusinessCounts> {
  const db = resolveDb(deps);
  const scope = { business_id: businessId };

  const base = await resetBusinessData(businessId, deps);
  const extra = {
    members: await db.businessMember.count({ where: scope }),
    business_settings: await db.businessSettings.count({ where: scope }),
    ai_settings: await db.aISettings.count({ where: scope }),
    ai_agents: await db.aIAgent.count({ where: scope }),
    ai_knowledge: await db.aIKnowledge.count({ where: scope }),
    memory: await db.conversationMemory.count({ where: scope }),
    subscriptions: await db.subscription.count({ where: scope }),
  };

  // Captura os usuários vinculados ANTES de apagar os vínculos (para remover
  // contas órfãs depois).
  const memberUsers = await db.businessMember.findMany({
    where: scope,
    select: { user_id: true },
  });
  const memberUserIds = [...new Set(memberUsers.map((m) => m.user_id))];

  await db.$transaction([
    db.conversationMemory.deleteMany({ where: scope }),
    db.businessSettings.deleteMany({ where: scope }),
    db.aISettings.deleteMany({ where: scope }),
    db.aIAgent.deleteMany({ where: scope }),
    db.aIKnowledge.deleteMany({ where: scope }),
    db.subscription.deleteMany({ where: scope }),
    db.businessMember.deleteMany({ where: scope }),
    db.business.delete({ where: { id: businessId } }),
  ]);

  // Remove contas de usuário órfãs (sem vínculo restante e sem papel de
  // plataforma) — nunca staff/admin da plataforma.
  let usersDeleted = 0;
  for (const uid of memberUserIds) {
    const u = await db.user
      .findUnique({
        where: { id: uid },
        select: { platform_role: true, _count: { select: { memberships: true } } },
      })
      .catch(() => null);
    if (u && u.platform_role === "NONE" && u._count.memberships === 0) {
      await db.user.delete({ where: { id: uid } }).catch(() => undefined);
      usersDeleted += 1;
    }
  }

  return { ...base, ...extra, users_deleted: usersDeleted };
}
