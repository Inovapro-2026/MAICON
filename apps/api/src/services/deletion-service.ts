/**
 * Serviço central de exclusão (SAVYRON).
 *
 * Todas as exclusões destrutivas de conversas e leads passam por aqui para
 * garantir consistência de escopo (businessId), permissão e auditoria.
 *
 * DECISÃO DE ESTRATÉGIA (documentada):
 * - Exclusão é HARD-DELETE (permanente). Não há soft-delete (deletedAt) no
 *   schema; conversas/leads são dados operacionais transitórios. Como não há
 *   registro "marcado como excluído", todos os contadores/consultas já
 *   refletem o estado real sem filtros adicionais.
 * - Mensagens pertencem ao Lead (Message.lead_id), não à Conversation. Como há
 *   @@unique([business_id, lead_id]) em Conversation, cada conversa corresponde
 *   a exatamente um lead → apagar mensagens do lead = apagar o histórico da
 *   conversa.
 * - AIGeneration possui FK conversation_id com onDelete: Cascade → é removida
 *   automaticamente ao excluir a conversa.
 * - CampaignLead possui FK lead_id com onDelete: Cascade → é removido
 *   automaticamente ao excluir o lead (limpeza de leads importados).
 * - AuditLog NÃO é removido: é imutável por design (trilha de auditoria).
 *
 * TESTABILIDADE: todas as funções aceitam `deps` opcional para injeção de
 * dependências (client Prisma + writer de auditoria). Em produção usam os
 * defaults (prisma real + writeAudit).
 */
import { prisma, PrismaClient } from '@prospector/database';
import { isImportedLeadSource, businessScope } from '@prospector/utils';
import { ApiError } from '../lib/http';
import { writeAudit as defaultWriteAudit, AuditInput } from './audit';

export interface AuditActor {
  sub?: string;
}

export interface DeletionDeps {
  db?: PrismaClient;
  writeAudit?: (input: AuditInput) => Promise<void>;
}

function resolveDeps(deps?: DeletionDeps): Required<DeletionDeps> {
  return {
    db: deps?.db ?? prisma,
    writeAudit: deps?.writeAudit ?? defaultWriteAudit,
  };
}

/**
 * Exclui UMA conversa (e todo o histórico de mensagens do lead) para a empresa.
 * Qualquer membro com acesso à empresa pode excluir conversas individuais.
 */
export async function deleteConversation(
  businessId: string,
  conversationId: string,
  actor?: AuditActor,
  deps?: DeletionDeps
): Promise<{ deleted: boolean }> {
  const { db, writeAudit: audit } = resolveDeps(deps);
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, business_id: businessId },
  });
  if (!conversation) throw ApiError.notFound('Conversa não encontrada');

  const deletedMessages = await db.message.deleteMany({
    where: { lead_id: conversation.lead_id, business_id: businessId },
  });

  await db.$transaction([
    db.aIGeneration.deleteMany({ where: { conversation_id: conversationId } }),
    db.conversationMemory.deleteMany({
      where: {
        business_id: businessId,
        key: `conversation:${conversationId}`,
      },
    }),
    db.conversation.delete({ where: { id: conversationId } }),
    // Apaga o LEAD por completo (cascade: optOut, campaignLead, demais
    // mensagens/conversas do lead também somem). Excluir conversa = excluir lead.
    db.lead.delete({ where: { id: conversation.lead_id } }),
  ]);

  void audit({
    actor: actor?.sub,
    businessId,
    action: 'conversation.deleted',
    entity: 'Conversation',
    entityId: conversationId,
    metadata: {
      lead_id: conversation.lead_id,
      lead_deleted: true,
      messages_deleted: deletedMessages.count,
    },
  });

  return { deleted: true };
}

/**
 * Exclui TODAS as conversas e o histórico de mensagens da empresa atual.
 * Restrito a OWNER/BUSINESS_ADMIN. Retorna o total excluído para auditoria/UI.
 */
export async function deleteAllConversations(
  businessId: string,
  actor?: AuditActor,
  deps?: DeletionDeps
): Promise<{ deleted: number; messages_deleted: number }> {
  const { db, writeAudit: audit } = resolveDeps(deps);
  const scope = businessScope(businessId);

  const [conversationCount, messageCount] = await Promise.all([
    db.conversation.count({ where: scope }),
    db.message.count({ where: scope }),
  ]);

  await db.$transaction([
    db.aIGeneration.deleteMany({ where: scope }),
    db.message.deleteMany({ where: scope }),
    db.conversation.deleteMany({ where: scope }),
  ]);

  void audit({
    actor: actor?.sub,
    businessId,
    action: 'conversations.cleared',
    entity: 'Conversation',
    metadata: { conversations_deleted: conversationCount, messages_deleted: messageCount },
  });

  return { deleted: conversationCount, messages_deleted: messageCount };
}

/**
 * Contagens dos leads importados (para a confirmação reforçada na UI).
 */
export async function countImportedLeads(
  businessId: string,
  deps?: DeletionDeps
): Promise<{ total_imported: number; in_queue: number }> {
  const { db } = resolveDeps(deps);
  const [totalImported, inQueue] = await Promise.all([
    db.lead.count({ where: { business_id: businessId, source: { not: 'MANUAL' } } }),
    db.lead.count({
      where: { business_id: businessId, source: { not: 'MANUAL' }, status: 'PENDING' },
    }),
  ]);
  return { total_imported: totalImported, in_queue: inQueue };
}

/**
 * Exclui TODOS os leads importados da empresa atual.
 * Restrito a OWNER/BUSINESS_ADMIN. A remoção do Lead cascateia (onDelete:
 * Cascade) para Messages, Conversations, CampaignLead, OptOut e AIGeneration.
 */
export async function clearImportedLeads(
  businessId: string,
  actor?: AuditActor,
  deps?: DeletionDeps
): Promise<{ deleted: number }> {
  const { db, writeAudit: audit } = resolveDeps(deps);
  const imported = await db.lead.findMany({
    where: { business_id: businessId, source: { not: 'MANUAL' } },
    select: { id: true },
  });
  const ids = imported.map((l) => l.id);

  if (ids.length) {
    await db.$transaction([
      db.aIGeneration.deleteMany({ where: { business_id: businessId, lead_id: { in: ids } } }),
      db.optOut.deleteMany({ where: { business_id: businessId, lead_id: { in: ids } } }),
      db.campaignLead.deleteMany({ where: { business_id: businessId, lead_id: { in: ids } } }),
      db.message.deleteMany({ where: { business_id: businessId, lead_id: { in: ids } } }),
      db.conversation.deleteMany({ where: { business_id: businessId, lead_id: { in: ids } } }),
      db.lead.deleteMany({ where: { business_id: businessId, id: { in: ids } } }),
    ]);
  }

  void audit({
    actor: actor?.sub,
    businessId,
    action: 'leads.imported.cleared',
    entity: 'Lead',
    metadata: { leads_deleted: ids.length },
  });

  return { deleted: ids.length };
}

/**
 * Apaga os leads criados por UMA extração de grupos do WhatsApp da empresa.
 * Restrito a OWNER/BUSINESS_ADMIN (validado na rota).
 *
 * Comportamento conservador (protege a base existente e as demais extrações):
 *  - Remove os vínculos (WhatsAppGroupLead) desta extração para TODOS os leads
 *    dela — a tabela "Leads extraídos" da extração é limpa.
 *  - Exclui (hard-delete; cascade remove mensagens, conversas, campaign leads,
 *    opt-outs e gerações de IA) apenas os leads criados pela própria extração
 *    (source WHATSAPP_GROUP) que NÃO estejam vinculados a outra extração.
 *  - Leads pré-existentes da base (WEB/CSV/MANUAL...) e leads compartilhados
 *    com outra extração são apenas desvinculados — nunca apagados.
 */
export async function clearWhatsAppExtractionLeads(
  businessId: string,
  extractionId: string,
  actor?: AuditActor,
  deps?: DeletionDeps
): Promise<{ leads_deleted: number; unlinked: number }> {
  const { db, writeAudit: audit } = resolveDeps(deps);

  const extraction = await db.whatsAppGroupExtraction.findFirst({
    where: { id: extractionId, business_id: businessId },
    select: { id: true, status: true, sources: { select: { id: true } } },
  });
  if (!extraction) throw ApiError.notFound('Extração não encontrada.');
  if (extraction.status === 'PENDING' || extraction.status === 'RUNNING') {
    throw ApiError.badRequest(
      'Não é possível limpar os leads enquanto a extração está em andamento.'
    );
  }

  const sourceIds = extraction.sources.map((s) => s.id);
  if (sourceIds.length === 0) return { leads_deleted: 0, unlinked: 0 };

  const links = await db.whatsAppGroupLead.findMany({
    where: { business_id: businessId, source_id: { in: sourceIds } },
    select: { id: true, lead_id: true },
  });
  if (links.length === 0) return { leads_deleted: 0, unlinked: 0 };

  const linkIds = links.map((l) => l.id);
  const leadIds = [...new Set(links.map((l) => l.lead_id))];

  // Leads vinculados a fontes de OUTRAS extrações não podem ser apagados.
  const shared = await db.whatsAppGroupLead.findMany({
    where: {
      business_id: businessId,
      lead_id: { in: leadIds },
      source_id: { notIn: sourceIds },
    },
    select: { lead_id: true },
  });
  const sharedLeadIds = new Set(shared.map((s) => s.lead_id));

  // Somente leads criados pela própria extração e não compartilhados.
  const deletableIds = leadIds.filter((id) => !sharedLeadIds.has(id));
  const deletable = deletableIds.length
    ? await db.lead.findMany({
        where: {
          business_id: businessId,
          id: { in: deletableIds },
          source: 'WHATSAPP_GROUP',
        },
        select: { id: true },
      })
    : [];
  const deletableLeadIds = new Set(deletable.map((l) => l.id));

  await db.$transaction([
    db.whatsAppGroupLead.deleteMany({
      where: { business_id: businessId, id: { in: linkIds } },
    }),
    db.lead.deleteMany({
      where: { business_id: businessId, id: { in: [...deletableLeadIds] } },
    }),
  ]);

  const unlinked = leadIds.filter((id) => !deletableLeadIds.has(id)).length;

  void audit({
    actor: actor?.sub,
    businessId,
    action: 'whatsapp_groups.leads_cleared',
    entity: 'WhatsAppGroupExtraction',
    entityId: extractionId,
    metadata: {
      extraction_id: extractionId,
      leads_deleted: deletableLeadIds.size,
      unlinked,
    },
  });

  return { leads_deleted: deletableLeadIds.size, unlinked };
}

/**
 * Exclui UMA extração de grupos do WhatsApp da empresa — inclusive o registro
 * de histórico. Restrito a OWNER/BUSINESS_ADMIN (validado na rota).
 *
 * Mesmo comportamento conservador do clearWhatsAppExtractionLeads (protege a
 * base existente e as demais extrações):
 *  - Remove vínculos (WhatsAppGroupLead) e fontes da extração;
 *  - Hard-delete apenas os leads criados pela própria extração (source
 *    WHATSAPP_GROUP) e NÃO compartilhados com outra extração;
 *  - Leads pré-existentes da base ou compartilhados são apenas desvinculados;
 *  - Remove o registro WhatsAppGroupExtraction (histórico da tabela).
 */
export async function deleteWhatsAppExtraction(
  businessId: string,
  extractionId: string,
  actor?: AuditActor,
  deps?: DeletionDeps
): Promise<{ leads_deleted: number; unlinked: number }> {
  const { db, writeAudit: audit } = resolveDeps(deps);

  const extraction = await db.whatsAppGroupExtraction.findFirst({
    where: { id: extractionId, business_id: businessId },
    select: { id: true, status: true, sources: { select: { id: true } } },
  });
  if (!extraction) throw ApiError.notFound('Extração não encontrada.');
  if (extraction.status === 'PENDING' || extraction.status === 'RUNNING') {
    throw ApiError.badRequest(
      'Não é possível excluir a extração enquanto ela está em andamento.'
    );
  }

  const sourceIds = extraction.sources.map((s) => s.id);
  let leads_deleted = 0;
  let unlinked = 0;

  if (sourceIds.length > 0) {
    const links = await db.whatsAppGroupLead.findMany({
      where: { business_id: businessId, source_id: { in: sourceIds } },
      select: { id: true, lead_id: true },
    });
    if (links.length > 0) {
      const linkIds = links.map((l) => l.id);
      const leadIds = [...new Set(links.map((l) => l.lead_id))];

      // Leads vinculados a fontes de OUTRAS extrações não podem ser apagados.
      const shared = await db.whatsAppGroupLead.findMany({
        where: {
          business_id: businessId,
          lead_id: { in: leadIds },
          source_id: { notIn: sourceIds },
        },
        select: { lead_id: true },
      });
      const sharedLeadIds = new Set(shared.map((s) => s.lead_id));

      // Somente leads criados pela própria extração e não compartilhados.
      const deletableIds = leadIds.filter((id) => !sharedLeadIds.has(id));
      const deletable = deletableIds.length
        ? await db.lead.findMany({
            where: {
              business_id: businessId,
              id: { in: deletableIds },
              source: 'WHATSAPP_GROUP',
            },
            select: { id: true },
          })
        : [];
      const deletableLeadIds = new Set(deletable.map((l) => l.id));

      if (deletableLeadIds.size > 0) {
        await db.lead.deleteMany({
          where: { business_id: businessId, id: { in: [...deletableLeadIds] } },
        });
      }
      await db.whatsAppGroupLead.deleteMany({
        where: { business_id: businessId, id: { in: linkIds } },
      });

      leads_deleted = deletableLeadIds.size;
      unlinked = leadIds.filter((id) => !deletableLeadIds.has(id)).length;
    }
  }

  await db.$transaction([
    db.whatsAppGroupSource.deleteMany({
      where: { business_id: businessId, extraction_id: extractionId },
    }),
    db.whatsAppGroupExtraction.deleteMany({
      where: { business_id: businessId, id: extractionId },
    }),
  ]);

  void audit({
    actor: actor?.sub,
    businessId,
    action: 'whatsapp_groups.extraction_deleted',
    entity: 'WhatsAppGroupExtraction',
    entityId: extractionId,
    metadata: { extraction_id: extractionId, leads_deleted, unlinked },
  });

  return { leads_deleted, unlinked };
}
