/**
 * Rotas de prospecção web (SAVYRON Prospector).
 * A API apenas cria a ProspectionRun e enfileira o trabalho no BullMQ.
 * Todo o processamento pesado roda no worker (nunca síncrono no HTTP).
 */
import { Router, Request, Response } from "express";
import { config } from "@prospector/config";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { QUEUE_NAMES } from "@prospector/queues";
import { asyncHandler, ok, ApiError } from "../lib/http";
import { requireAuth, requireBusiness } from "../middleware/auth";
import { getQueue } from "../services/queues";
import { writeAudit } from "../services/audit";
import { checkFeatureAccess } from "../services/billing";

const logger = createLogger("api.prospecting");

export const prospectingRouter = Router();

prospectingRouter.use(requireAuth);
prospectingRouter.use(requireBusiness);

/**
 * POST /leads/prospect
 * Cria a ProspectionRun e enfileira no BullMQ.
 * Responde rápido: { jobId, prospectionRunId, status: 'PENDING' }.
 */
prospectingRouter.post(
  "/prospect",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    const { campaignId, segment, country, state, city, targetQuantity } =
      req.body ?? {};

    // Validação mínima: precisa de um alvo (segmento OU localização).
    const hasTarget = Boolean(segment?.trim() || city?.trim() || state?.trim());
    if (!hasTarget) {
      throw ApiError.badRequest(
        "Informe pelo menos o segmento ou a cidade/estado a prospectar.",
      );
    }
    if (!segment && !city && !state) {
      throw ApiError.badRequest(
        "Informe o segmento (ex: barbearia) ou a localização alvo.",
      );
    }

    const target = Number(targetQuantity ?? 20);
    if (!Number.isFinite(target) || target < 1) {
      throw ApiError.badRequest(
        "targetQuantity deve ser um número inteiro >= 1.",
      );
    }
    const clampedTarget = Math.min(target, config.prospector.maxLeadsPerRun);

    // Prospecção web (busca automática) é restrita por plano: apenas planos
    // com a feature `prospeccao_web` habilitada podem criar novas buscas.
    // PLATFORM_ADMIN tem acesso total (ignora restrição de plano), com
    // auditoria quando isso acontece. Validação real no backend.
    const access = await checkFeatureAccess(
      businessId,
      "prospeccao_web",
      req.user,
    );
    if (!access.allowed) {
      throw ApiError.forbidden(
        "A prospecção web automática está disponível apenas no plano Empresa. Faça upgrade do seu plano para usar este recurso.",
      );
    }
    if (access.adminBypass) {
      void writeAudit({
        actor: req.user!.sub,
        businessId,
        action: "prospection.admin_bypass_plan",
        entity: "ProspectionRun",
        metadata: { feature: "prospeccao_web" },
      });
    }

    // Campanha (opcional) deve pertencer à empresa.
    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, business_id: businessId },
        select: { id: true },
      });
      if (!campaign)
        throw ApiError.notFound("Campanha não encontrada para esta empresa.");
    }

    // Proteção contra abuso: limites por tenant.
    const activeCount = await prisma.prospectionRun.count({
      where: {
        business_id: businessId,
        status: { in: ["RUNNING", "PENDING"] },
      },
    });
    if (activeCount >= config.prospector.maxActivePerTenant) {
      throw ApiError.tooManyRequests(
        `Você já possui ${activeCount} prospecção(ões) em andamento. Aguarde concluir para iniciar outra.`,
      );
    }
    const pendingCount = await prisma.prospectionRun.count({
      where: { business_id: businessId, status: "PENDING" },
    });
    if (pendingCount >= config.prospector.maxPendingPerTenant) {
      throw ApiError.tooManyRequests(
        `Limite de prospecções pendentes atingido (${config.prospector.maxPendingPerTenant}).`,
      );
    }

    const run = await prisma.prospectionRun.create({
      data: {
        business_id: businessId,
        campaign_id: campaignId || null,
        segment: segment?.trim() || null,
        country: country?.trim() || null,
        state: state?.trim() || null,
        city: city?.trim() || null,
        target_quantity: clampedTarget,
        status: "PENDING",
      },
    });

    // Enfileira o job. O businessId vem da sessão autenticada (isolamento multi-tenant).
    const queue = getQueue(QUEUE_NAMES.PROSPECTION);
    const job = await queue.add(
      "prospect",
      {
        runId: run.id,
        businessId,
        campaignId: campaignId || undefined,
        segment: segment?.trim() || undefined,
        country: country?.trim() || undefined,
        state: state?.trim() || undefined,
        city: city?.trim() || undefined,
        targetQuantity: clampedTarget,
      },
      {
        jobId: `prospect-${run.id}`,
        attempts: config.prospector.retryAttempts,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
        priority: 0,
      },
    );

    logger.info("Prospecção enfileirada", {
      business_id: businessId,
      prospection_run_id: run.id,
      job_id: job.id,
      target: clampedTarget,
    });

    return ok(
      res,
      {
        jobId: String(job.id),
        prospectionRunId: run.id,
        status: "PENDING",
        targetQuantity: clampedTarget,
      },
      202,
    );
  }),
);

/** GET /leads/prospections — histórico da empresa. */
prospectingRouter.get(
  "/prospections",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const runs = await prisma.prospectionRun.findMany({
      where: { business_id: businessId },
      orderBy: { created_at: "desc" },
      take: 50,
      select: {
        id: true,
        segment: true,
        country: true,
        state: true,
        city: true,
        target_quantity: true,
        status: true,
        found_count: true,
        saved_count: true,
        duplicate_count: true,
        error_count: true,
        phone_count: true,
        email_count: true,
        avg_score: true,
        created_at: true,
        updated_at: true,
        started_at: true,
        completed_at: true,
        cancelled_at: true,
      },
    });
    return ok(res, runs);
  }),
);

/** GET /leads/prospections/:id — progresso detalhado. */
prospectingRouter.get(
  "/prospections/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const run = await prisma.prospectionRun.findFirst({
      where: { id: req.params.id, business_id: businessId },
      include: {
        campaign: { select: { id: true, name: true } },
      },
    });
    if (!run) throw ApiError.notFound("Prospecção não encontrada.");
    return ok(res, run);
  }),
);

/** GET /leads/prospections/:id/leads — leads encontrados por uma run (tabela de resultados). */
prospectingRouter.get(
  "/prospections/:id/leads",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const run = await prisma.prospectionRun.findFirst({
      where: { id: req.params.id, business_id: businessId },
      select: { id: true },
    });
    if (!run) throw ApiError.notFound("Prospecção não encontrada.");

    const leads = await prisma.lead.findMany({
      where: { business_id: businessId, prospection_run_id: run.id },
      orderBy: { collected_at: "desc" },
      take: 500,
      select: {
        id: true,
        name: true,
        business_name: true,
        phone: true,
        email: true,
        city: true,
        state: true,
        website: true,
        source: true,
        source_type: true,
        lead_score: true,
        collected_at: true,
        created_at: true,
      },
    });

    return ok(res, { runId: run.id, total: leads.length, leads });
  }),
);

/** POST /leads/prospections/:id/cancel — cancela com segurança (worker respeita). */
prospectingRouter.post(
  "/prospections/:id/cancel",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const run = await prisma.prospectionRun.findFirst({
      where: { id: req.params.id, business_id: businessId },
    });
    if (!run) throw ApiError.notFound("Prospecção não encontrada.");

    if (["COMPLETED", "FAILED", "CANCELLED", "PARTIAL"].includes(run.status)) {
      return ok(res, {
        id: run.id,
        status: run.status,
        message: "Prospecção já finalizada.",
      });
    }

    const updated = await prisma.prospectionRun.update({
      where: { id: run.id },
      data: { status: "CANCELLED", cancelled_at: new Date() },
    });

    logger.info("Prospecção cancelada", {
      business_id: businessId,
      prospection_run_id: run.id,
    });

    return ok(res, { id: updated.id, status: updated.status });
  }),
);

/**
 * DELETE /leads/prospections/:id
 * Exclui DEFINITIVAMENTE uma run de prospecção (e os leads criados por ela,
 * com cascade para mensagens/conversas/opt-outs/vínculos de campanha).
 * Só permite excluir runs em estado terminal (COMPLETED/PARTIAL/FAILED/
 * CANCELLED) — runs em andamento exigem cancelamento primeiro.
 */
prospectingRouter.delete(
  "/prospections/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const run = await prisma.prospectionRun.findFirst({
      where: { id: req.params.id, business_id: businessId },
      select: { id: true, status: true },
    });
    if (!run) throw ApiError.notFound("Prospecção não encontrada.");

    if (["PENDING", "RUNNING"].includes(run.status)) {
      throw ApiError.conflict(
        "Cancele/encerre a prospecção antes de excluí-la.",
      );
    }

    // Leads criados por esta run (source WEB, prospection_run_id = run.id).
    const leadRows = await prisma.lead.findMany({
      where: { business_id: businessId, prospection_run_id: run.id },
      select: { id: true },
    });
    const leadIds = leadRows.map((l) => l.id);

    await prisma.$transaction(async (tx) => {
      if (leadIds.length > 0) {
        await tx.aIGeneration.deleteMany({
          where: { business_id: businessId, lead_id: { in: leadIds } },
        });
        await tx.optOut.deleteMany({
          where: { business_id: businessId, lead_id: { in: leadIds } },
        });
        await tx.campaignLead.deleteMany({
          where: { business_id: businessId, lead_id: { in: leadIds } },
        });
        await tx.message.deleteMany({
          where: { business_id: businessId, lead_id: { in: leadIds } },
        });
        await tx.conversation.deleteMany({
          where: { business_id: businessId, lead_id: { in: leadIds } },
        });
        await tx.lead.deleteMany({
          where: { business_id: businessId, id: { in: leadIds } },
        });
      }
      await tx.prospectionRun.delete({ where: { id: run.id } });
    });

    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: "prospection.deleted",
      entity: "ProspectionRun",
      entityId: run.id,
      metadata: { leads_deleted: leadIds.length },
    });

    logger.info("Prospecção excluída", {
      business_id: businessId,
      prospection_run_id: run.id,
      leads_deleted: leadIds.length,
    });

    return ok(res, { id: run.id, deleted: true, leads_deleted: leadIds.length });
  }),
);
