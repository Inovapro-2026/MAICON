/**
 * Extração de contatos de grupos do WhatsApp (aba WhatsApp da Prospecção).
 *
 * A API apenas:
 *  - lista grupos (proxy p/ worker, que detém a sessão Baileys da empresa);
 *  - cria a WhatsAppGroupExtraction e enfileira o trabalho no BullMQ;
 *  - consulta histórico/progresso das extrações.
 *
 * Salvaguardas legais (obrigatórias antes de qualquer extração):
 *  1. `confirmLegal` = true no corpo do POST (checkbox de responsabilidade);
 *  2. Função restrita a OWNER/BUSINESS_ADMIN;
 *  3. Feature de plano `whatsapp_group_extraction` + assinatura ativa;
 *  4. A extração NUNCA envia mensagens — o worker cria apenas leads (e, se
 *     escolhido, vincula à campanha, que nasce PAUSED).
 */
import { Router, Request, Response } from "express";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { QUEUE_NAMES } from "@prospector/queues";
import { asyncHandler, ok, ApiError } from "../lib/http";
import { requireAuth, requireBusiness, requireRole } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/active-subscription";
import { getQueue } from "../services/queues";
import { writeAudit } from "../services/audit";
import { checkFeatureAccess } from "../services/billing";
import {
  clearWhatsAppExtractionLeads,
  deleteWhatsAppExtraction,
} from "../services/deletion-service";
import { proxyToWorker } from "./whatsapp";

const logger = createLogger("api.whatsapp-groups");

const DESTINATIONS = ["leads", "enrich", "campaign"] as const;
type ExtractionDestination = (typeof DESTINATIONS)[number];

export const whatsappGroupsRouter = Router();

whatsappGroupsRouter.use(requireAuth);
whatsappGroupsRouter.use(requireBusiness);

/**
 * GET /whatsapp/groups/list
 * Grupos em que a empresa participa (proxy para a sessão Baileys do worker).
 */
whatsappGroupsRouter.get(
  "/list",
  requireActiveSubscription,
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    const access = await checkFeatureAccess(businessId, "whatsapp_group_extraction", req.user);
    if (!access.allowed) {
      throw ApiError.forbidden(
        "A extração de contatos de grupos do WhatsApp está disponível apenas no plano Empresa. Faça upgrade do seu plano para usar este recurso.",
      );
    }
    if (access.adminBypass) {
      void writeAudit({
        actor: req.user!.sub,
        businessId,
        action: "whatsapp_groups.admin_bypass_plan",
        entity: "WhatsAppGroupExtraction",
        metadata: { feature: "whatsapp_group_extraction" },
      });
    }

    try {
      const groups = await proxyToWorker("/whatsapp/groups", req);
      return ok(res, groups);
    } catch (error) {
      logger.warn("Worker indisponível para listar grupos", { error });
      throw new ApiError(503, "SERVICE_UNAVAILABLE",
        "Não foi possível listar os grupos do WhatsApp. Verifique se a conexão está ativa.",
      );
    }
  }),
);

/**
 * POST /whatsapp/groups/extract
 * Cria a extração e enfileira no BullMQ.
 * Corpo: { groupIds: string[]; options?: {...}; destination?: 'leads'|'enrich'|'campaign'; confirmLegal: boolean }
 */
whatsappGroupsRouter.post(
  "/extract",
  requireActiveSubscription,
  requireRole(["OWNER", "BUSINESS_ADMIN"]),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    const { groupIds, options, destination, confirmLegal } = req.body ?? {};

    // Safeguard legal: checkbox de responsabilidade é obrigatório e validado
    // no servidor (nunca confiar apenas na UI).
    if (confirmLegal !== true) {
      throw ApiError.badRequest(
        "É necessário confirmar o checkbox de responsabilidade legal antes de extrair contatos de grupos.",
      );
    }

    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      throw ApiError.badRequest("Selecione ao menos um grupo do WhatsApp para extrair.");
    }
    const cleanGroupIds = (groupIds as unknown[])
      .filter((g): g is string => typeof g === "string" && g.length > 0)
      .slice(0, 50);
    if (cleanGroupIds.length === 0) {
      throw ApiError.badRequest("Grupos inválidos. Selecione grupos válidos.");
    }

    const dest: ExtractionDestination = DESTINATIONS.includes(destination as ExtractionDestination)
      ? (destination as ExtractionDestination)
      : "leads";

    const access = await checkFeatureAccess(businessId, "whatsapp_group_extraction", req.user);
    if (!access.allowed) {
      throw ApiError.forbidden(
        "A extração de contatos de grupos do WhatsApp está disponível apenas no plano Empresa. Faça upgrade do seu plano para usar este recurso.",
      );
    }
    if (access.adminBypass) {
      void writeAudit({
        actor: req.user!.sub,
        businessId,
        action: "whatsapp_groups.admin_bypass_plan",
        entity: "WhatsAppGroupExtraction",
        metadata: { feature: "whatsapp_group_extraction" },
      });
    }

    // Proteção contra abuso: apenas 1 extração ativa por empresa.
    const activeCount = await prisma.whatsAppGroupExtraction.count({
      where: { business_id: businessId, status: { in: ["PENDING", "RUNNING"] } },
    });
    if (activeCount > 0) {
      throw ApiError.tooManyRequests(
        "Já existe uma extração de grupos em andamento. Aguarde concluir para iniciar outra.",
      );
    }

    const extraction = await prisma.whatsAppGroupExtraction.create({
      data: {
        business_id: businessId,
        status: "PENDING",
        group_ids: cleanGroupIds,
        remove_duplicates: options?.removeDuplicates !== false,
        ignore_own_contact: options?.ignoreOwnContact !== false,
        exclude_admins: options?.excludeAdmins === true,
        auto_enrich: options?.autoEnrich === true,
        destination: dest,
      },
    });

    const queue = getQueue(QUEUE_NAMES.WHATSAPP_GROUP_EXTRACTION);
    const job = await queue.add(
      "extract",
      { extractionId: extraction.id, businessId },
      {
        jobId: `whatsapp-groups-${extraction.id}`,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );

    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: "whatsapp_groups.extraction_started",
      entity: "WhatsAppGroupExtraction",
      entityId: extraction.id,
      metadata: {
        groups: cleanGroupIds.length,
        destination: dest,
        remove_duplicates: extraction.remove_duplicates,
        ignore_own_contact: extraction.ignore_own_contact,
        exclude_admins: extraction.exclude_admins,
        auto_enrich: extraction.auto_enrich,
      },
    });

    logger.info("Extração de grupos do WhatsApp enfileirada", {
      business_id: businessId,
      extraction_id: extraction.id,
      job_id: job.id,
      groups: cleanGroupIds.length,
      destination: dest,
    });

    return ok(
      res,
      {
        jobId: String(job.id),
        extractionId: extraction.id,
        status: "PENDING",
      },
      202,
    );
  }),
);

/** GET /whatsapp/groups/extractions — histórico da empresa. */
whatsappGroupsRouter.get(
  "/extractions",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const extractions = await prisma.whatsAppGroupExtraction.findMany({
      where: { business_id: businessId },
      orderBy: { created_at: "desc" },
      take: 50,
      include: {
        sources: { select: { group_name: true, group_identifier: true, participant_count: true } },
        campaign: { select: { id: true, name: true, status: true } },
      },
    });
    return ok(res, extractions);
  }),
);

/** GET /whatsapp/groups/extractions/:id — progresso/resultado de uma extração. */
whatsappGroupsRouter.get(
  "/extractions/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const extraction = await prisma.whatsAppGroupExtraction.findFirst({
      where: { id: req.params.id, business_id: businessId },
      include: {
        sources: true,
        campaign: { select: { id: true, name: true, status: true } },
      },
    });
    if (!extraction) throw ApiError.notFound("Extração não encontrada.");
    return ok(res, extraction);
  }),
);

/**
 * POST /whatsapp/groups/extractions/:id/export-to-campaign
 * Exporta os leads de uma extração CONCLUÍDA para a campanha da empresa
 * (mesma regra do destino "campaign": 1 campanha por empresa, nasce/fica
 * PAUSED — nenhuma mensagem é enviada automaticamente por esta exportação).
 */
whatsappGroupsRouter.post(
  "/extractions/:id/export-to-campaign",
  requireActiveSubscription,
  requireRole(["OWNER", "BUSINESS_ADMIN"]),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    const access = await checkFeatureAccess(businessId, "whatsapp_group_extraction", req.user);
    if (!access.allowed) {
      throw ApiError.forbidden(
        "A extração de contatos de grupos do WhatsApp está disponível apenas no plano Empresa. Faça upgrade do seu plano para usar este recurso.",
      );
    }
    if (access.adminBypass) {
      void writeAudit({
        actor: req.user!.sub,
        businessId,
        action: "whatsapp_groups.admin_bypass_plan",
        entity: "WhatsAppGroupExtraction",
        metadata: { feature: "whatsapp_group_extraction" },
      });
    }

    const extraction = await prisma.whatsAppGroupExtraction.findFirst({
      where: { id: req.params.id, business_id: businessId },
      select: {
        id: true,
        status: true,
        campaign_id: true,
        sources: { select: { id: true, group_name: true } },
      },
    });
    if (!extraction) throw ApiError.notFound("Extração não encontrada.");
    if (extraction.status !== "COMPLETED") {
      throw ApiError.badRequest(
        "Só é possível exportar para a campanha depois que a extração for concluída.",
      );
    }

    // Leads salvos por esta extração (participantes vinculados aos grupos).
    const sourceIds = extraction.sources.map((s) => s.id);
    const links = await prisma.whatsAppGroupLead.findMany({
      where: { business_id: businessId, source_id: { in: sourceIds } },
      select: { lead_id: true },
    });
    const leadIds = [...new Set(links.map((l) => l.lead_id))];
    if (leadIds.length === 0) {
      throw ApiError.badRequest(
        "Nenhum lead com telefone foi salvo nesta extração para vincular à campanha.",
      );
    }

    // Regra de 1 campanha por empresa: reusa a existente ou cria uma PAUSED.
    let campaign = null;
    if (extraction.campaign_id) {
      campaign = await prisma.campaign.findFirst({
        where: { id: extraction.campaign_id, business_id: businessId },
      });
    }
    if (!campaign) {
      campaign = await prisma.campaign.findFirst({
        where: { business_id: businessId },
        orderBy: { created_at: "asc" },
      });
    }
    if (!campaign) {
      const settings = await prisma.businessSettings.findFirst({
        where: { business_id: businessId },
      });
      const groupName = extraction.sources[0]?.group_name ?? "Contatos de grupos";
      campaign = await prisma.campaign.create({
        data: {
          business_id: businessId,
          name: `WhatsApp — ${groupName}`.slice(0, 190),
          status: "PAUSED",
          daily_whatsapp_limit: settings?.whatsapp_daily_limit ?? 30,
          daily_email_limit: settings?.email_daily_limit ?? 100,
          interval_seconds: settings?.interval_seconds ?? 7200,
        },
      });
    }

    const linked = await prisma.campaignLead.createMany({
      data: leadIds.map((leadId) => ({
        business_id: businessId,
        campaign_id: campaign.id,
        lead_id: leadId,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });

    if (campaign.id !== extraction.campaign_id) {
      await prisma.whatsAppGroupExtraction.update({
        where: { id: extraction.id },
        data: { campaign_id: campaign.id },
      });
    }

    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: "whatsapp_groups.exported_to_campaign",
      entity: "WhatsAppGroupExtraction",
      entityId: extraction.id,
      metadata: {
        campaign_id: campaign.id,
        campaign_status: campaign.status,
        leads: leadIds.length,
        linked_new: linked.count,
      },
    });

    logger.info("Leads de extração de grupo vinculados à campanha", {
      business_id: businessId,
      extraction_id: extraction.id,
      campaign_id: campaign.id,
      campaign_status: campaign.status,
      leads: leadIds.length,
      linked_new: linked.count,
    });

    return ok(res, {
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      total: leadIds.length,
      linkedNew: linked.count,
    });
  }),
);

/** GET /whatsapp/groups/extractions/:id/leads — leads de uma extração. */
whatsappGroupsRouter.get(
  "/extractions/:id/leads",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const extraction = await prisma.whatsAppGroupExtraction.findFirst({
      where: { id: req.params.id, business_id: businessId },
      select: { id: true, sources: { select: { id: true } } },
    });
    if (!extraction) throw ApiError.notFound("Extração não encontrada.");

    const sourceIds = extraction.sources.map((s) => s.id);
    const links = await prisma.whatsAppGroupLead.findMany({
      where: { business_id: businessId, source_id: { in: sourceIds } },
      select: {
        is_admin: true,
        source: { select: { group_name: true, group_identifier: true } },
        lead: true,
      },
    });
    const leads = links.map((l) => ({
      ...l.lead,
      isAdmin: l.is_admin,
      group_name: l.source.group_name,
      group_identifier: l.source.group_identifier,
    }));
    return ok(res, { extractionId: extraction.id, total: leads.length, leads });
  }),
);

/**
 * DELETE /whatsapp/groups/extractions/:id/leads
 * Apaga os leads criados por esta extração (lista "Leads extraídos" da aba).
 * Ação destrutiva de alto risco: restrita a OWNER/BUSINESS_ADMIN, com
 * confirmação reforçada na UI e registro em AuditLog. Leads pré-existentes da
 * base e leads compartilhados com outra extração são apenas desvinculados.
 */
whatsappGroupsRouter.delete(
  "/extractions/:id/leads",
  requireActiveSubscription,
  requireRole(["OWNER", "BUSINESS_ADMIN"]),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    const access = await checkFeatureAccess(businessId, "whatsapp_group_extraction", req.user);
    if (!access.allowed) {
      throw ApiError.forbidden(
        "A extração de contatos de grupos do WhatsApp está disponível apenas no plano Empresa. Faça upgrade do seu plano para usar este recurso.",
      );
    }

    const result = await clearWhatsAppExtractionLeads(businessId, req.params.id, {
      sub: req.user!.sub,
    });

    logger.warn("Leads de extração de grupo apagados", {
      business_id: businessId,
      extraction_id: req.params.id,
      ...result,
    });

    return ok(res, result);
  }),
);

/**
 * DELETE /whatsapp/groups/extractions/:id
 * Exclui UMA extração (registro de histórico) e os leads criados por ela —
 * mesmo comportamento conservador da limpeza de leads (leads pré-existentes da
 * base ou compartilhados com outra extração são apenas desvinculados). Ação
 * destrutiva de alto risco: restrita a OWNER/BUSINESS_ADMIN, com confirmação
 * reforçada na UI e registro em AuditLog.
 */
whatsappGroupsRouter.delete(
  "/extractions/:id",
  requireActiveSubscription,
  requireRole(["OWNER", "BUSINESS_ADMIN"]),
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    const access = await checkFeatureAccess(businessId, "whatsapp_group_extraction", req.user);
    if (!access.allowed) {
      throw ApiError.forbidden(
        "A extração de contatos de grupos do WhatsApp está disponível apenas no plano Empresa. Faça upgrade do seu plano para usar este recurso.",
      );
    }

    const result = await deleteWhatsAppExtraction(businessId, req.params.id, {
      sub: req.user!.sub,
    });

    logger.warn("Extração de grupos do WhatsApp excluída", {
      business_id: businessId,
      extraction_id: req.params.id,
      ...result,
    });

    return ok(res, result);
  }),
);