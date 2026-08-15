import { Router, Request, Response } from "express";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { config } from "@prospector/config";
import { ALL_QUEUES } from "@prospector/queues";
import { asyncHandler, ok, ApiError } from "../lib/http";
import {
  requireAuth,
  requirePlatformRole,
  requirePlatformAdmin,
} from "../middleware/auth";
import { signToken } from "../services/jwt";
import { writeAudit } from "../services/audit";
import { hashPassword, validatePasswordStrength } from "../services/password";
import {
  normalizePlatformRole,
  normalizeBusinessRole,
  normalizeBusinessStatus,
  validatePlatformRoleChange,
} from "@prospector/utils";
import {
  changeSubscriptionPlan,
  changeBusinessPlan,
  cancelSubscription,
  reactivateSubscription,
} from "../services/billing";
import { resetBusinessData, ResetCounts } from "../services/business-reset";
import { getQueue } from "../services/queues";
import { getStripe, isStripeConfigured } from "../services/stripe";
import {
  processInvoicePaymentSucceeded,
  processInvoicePaymentFailed,
} from "../services/stripe-billing";
import {
  isCaktoConfigured,
  updateCaktoOfferPrice,
} from "../services/cakto";

const logger = createLogger("api.admin");

export const adminRouter = Router();

// Leitura: PLATFORM_ADMIN ou PLATFORM_STAFF.
// Escrita (POST/PATCH/DELETE): apenas PLATFORM_ADMIN.
adminRouter.use(requireAuth, requirePlatformRole);

const adminWrite = requirePlatformAdmin;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Converte query de data (YYYY-MM-DD) em Date com início/fim do dia. */
function parseDateRange(
  fromRaw?: string,
  toRaw?: string,
): { from: Date; to: Date } | null {
  const now = new Date();
  const from = fromRaw
    ? new Date(`${fromRaw}T00:00:00.000Z`)
    : new Date(now.getFullYear(), 0, 1);
  const to = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : now;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { from, to };
}

// ---------------------------------------------------------------------------
// Dashboard — receita, churn, empresas, uso de IA
// ---------------------------------------------------------------------------

adminRouter.get(
  "/dashboard",
  asyncHandler(async (_req: Request, res: Response) => {
    const monthStart = startOfMonth();
    const now = new Date();

    const [
      totalBusinesses,
      activeBusinesses,
      pendingBusinesses,
      cancelledBusinesses,
      trialBusinesses,
      monthRevenueRows,
      allSubscriptions,
      totalPaymentsRows,
      totalMessages,
      totalConversations,
      totalAI,
      totalContacts,
    ] = await Promise.all([
      prisma.business.count(),
      prisma.business.count({ where: { status: "ACTIVE" } }),
      prisma.business.count({ where: { status: "PENDING_PAYMENT" } }),
      prisma.business.count({ where: { status: "CANCELLED" } }),
      prisma.business.count({ where: { status: "TRIAL" } }),
      prisma.payment.findMany({
        where: { status: "RECEIVED", paid_at: { gte: monthStart } },
        select: { value: true },
      }),
      prisma.subscription.findMany({
        select: { status: true, plan_price: true },
      }),
      prisma.payment.findMany({
        where: { status: "RECEIVED" },
        select: { value: true },
      }),
      prisma.message.count(),
      prisma.conversation.count(),
      prisma.aIGeneration.count(),
      prisma.lead.count(),
    ]);

    const monthRevenue = monthRevenueRows.reduce(
      (acc, p) => acc + Number(p.value),
      0,
    );
    const totalRevenue = totalPaymentsRows.reduce(
      (acc, p) => acc + Number(p.value),
      0,
    );

    const activeSubscriptions = allSubscriptions.filter(
      (s) => s.status === "ACTIVE",
    );
    const mrr = activeSubscriptions.length;
    const mrrValue = activeSubscriptions.reduce(
      (acc, s) => acc + Number(s.plan_price ?? 0),
      0,
    );
    const churn =
      totalBusinesses > 0 ? cancelledBusinesses / totalBusinesses : 0;

    const [overdueSubs, pendingPayments] = await Promise.all([
      prisma.subscription.count({ where: { status: "PAST_DUE" } }),
      prisma.payment.count({ where: { status: "PENDING" } }),
    ]);

    return ok(res, {
      mrr,
      arr: mrr * 12,
      mrr_value: mrrValue,
      month_revenue: monthRevenue,
      total_revenue: totalRevenue,
      new_clients: totalBusinesses,
      active_clients: activeBusinesses,
      trial: trialBusinesses,
      cancelled: cancelledBusinesses,
      churn,
      overdue_subscriptions: overdueSubs,
      pending_payments: pendingPayments,
      ai_usage: {
        messages: totalMessages,
        conversations: totalConversations,
        generations: totalAI,
        contacts: totalContacts,
      },
      businesses: {
        total: totalBusinesses,
        active: activeBusinesses,
        pending_payment: pendingBusinesses,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------

/** GET /admin/businesses?status=&q= — listagem com filtros e consumo. */
adminRouter.get(
  "/businesses",
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const q = req.query.q ? String(req.query.q) : undefined;

    const businesses = await prisma.business.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as never } },
                { slug: { contains: q, mode: "insensitive" as never } },
                { email: { contains: q, mode: "insensitive" as never } },
                { cnpj: { contains: q, mode: "insensitive" as never } },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: {
            leads: true,
            conversations: true,
            messages: true,
            members: true,
          },
        },
        subscriptions: true,
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });

    return ok(
      res,
      businesses.map((b) => ({
        ...b,
        subscriptions: b.subscriptions.map((s) => ({
          status: s.status,
          plan_name: s.plan_name,
        })),
      })),
    );
  }),
);

/** GET /admin/businesses/:id — detalhe (infos, membros, assinatura, consumo, IA). */
adminRouter.get(
  "/businesses/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const business = await prisma.business.findUnique({
      where: { id: String(req.params.id) },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
        subscriptions: {
          include: { payments: { orderBy: { created_at: "desc" as const } } },
        },
        settings: true,
      },
    });
    if (!business) throw ApiError.notFound("Empresa não encontrada");

    const [messageCount, conversationCount, leadCount, aiCount] =
      await Promise.all([
        prisma.message.count({ where: { business_id: business.id } }),
        prisma.conversation.count({ where: { business_id: business.id } }),
        prisma.lead.count({ where: { business_id: business.id } }),
        prisma.aIGeneration.count({ where: { business_id: business.id } }),
      ]);

    return ok(res, {
      business,
      totals: {
        messages: messageCount,
        conversations: conversationCount,
        contacts: leadCount,
        ai: aiCount,
      },
    });
  }),
);

/** PATCH /admin/businesses/:id — editar dados/status da empresa (PLATFORM_ADMIN). */
adminRouter.patch(
  "/businesses/:id",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = req.body ?? {};
    const allowed = [
      "name",
      "legal_name",
      "trade_name",
      "cnpj",
      "segment",
      "description",
      "email",
      "phone",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    const business = await prisma.business.update({ where: { id }, data });
    void writeAudit({
      actor: req.user!.sub,
      businessId: id,
      action: "admin.business.updated",
      entity: "Business",
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    return ok(res, business);
  }),
);

/** POST /admin/businesses/:id/status — suspender/reativar/cancelar (PLATFORM_ADMIN). */
adminRouter.post(
  "/businesses/:id/status",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const rawStatus = String(req.body?.status ?? "");
    const status = normalizeBusinessStatus(rawStatus);
    if (!status || status === "PENDING_PAYMENT")
      throw ApiError.badRequest("Status inválido");

    const business = await prisma.business.update({
      where: { id },
      data: { status },
    });
    await prisma.subscription.updateMany({
      where: { business_id: id },
      data: {
        status:
          status === "ACTIVE"
            ? "ACTIVE"
            : status === "SUSPENDED"
              ? "SUSPENDED"
              : status === "CANCELLED"
                ? "CANCELLED"
                : status === "PAST_DUE"
                  ? "PAST_DUE"
                  : status === "TRIAL"
                    ? "TRIALING"
                    : "ACTIVE",
      },
    });
    void writeAudit({
      actor: req.user!.sub,
      businessId: id,
      action: "admin.business.status_changed",
      entity: "Business",
      entityId: id,
      metadata: { status, to: status },
    });
    logger.info("Status da empresa alterado pelo admin", {
      businessId: id,
      status,
      actor: req.user!.sub,
    });
    return ok(res, { business });
  }),
);

/** POST /admin/businesses/:id/change-plan — troca o plano da empresa (PLATFORM_ADMIN). */
adminRouter.post(
  "/businesses/:id/change-plan",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = String(req.params.id);
    const planId = String(req.body?.plan_id ?? "");
    if (!planId) throw ApiError.badRequest("Informe plan_id");

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) throw ApiError.notFound("Empresa não encontrada");

    const result = await changeBusinessPlan(businessId, planId);

    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: "admin.business.plan_changed",
      entity: "Business",
      entityId: businessId,
      metadata: { plan_id: planId, business: business.name },
    });
    logger.info("Plano da empresa alterado pelo admin", {
      businessId,
      planId,
      actor: req.user!.sub,
    });

    return ok(res, result);
  }),
);

/**
 * POST /admin/businesses/:id/reset — RESET de dados de UMA empresa.
 * Restrito a PLATFORM_ADMIN e exige confirmação explícita (EXCLUIR).
 * Apaga dados operacionais (leads, campanhas, conversas, mensagens, opt-outs,
 * eventos, gerações de IA, imports, prospecções) e limpa sessão do WhatsApp
 * (via worker) + jobs pendentes da empresa nas filas do Redis.
 * Preserva User/Login, Business, membros, assinatura e pagamentos.
 */
adminRouter.post(
  "/businesses/:id/reset",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = String(req.params.id);
    const confirm = String(req.body?.confirm ?? "");
    if (confirm !== "EXCLUIR") {
      throw ApiError.badRequest(
        "Confirmação inválida. Digite EXCLUIR para resetar a conta.",
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });
    if (!business) throw ApiError.notFound("Empresa não encontrada");

    // 1) Banco (transação escopada por business_id).
    const counts = await resetBusinessData(businessId);

    // 2) Sessão do WhatsApp (Baileys) — worker desconecta e apaga os arquivos.
    let whatsappCleared = false;
    try {
      const res = await fetch(
        `${config.app.workerBaseUrl}/whatsapp/clear-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-worker-token": config.app.apiToken,
          },
          body: JSON.stringify({ businessId }),
        },
      );
      whatsappCleared = res.ok;
    } catch (error) {
      logger.warn("Falha ao limpar sessão WhatsApp no reset", {
        businessId,
        error: (error as Error).message,
      });
    }

    // 3) Filas do Redis: remove jobs pendentes da empresa (evita jobs órfãos).
    const jobsRemoved = await removeBusinessJobs(businessId);

    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: "admin.business.reset",
      entity: "Business",
      entityId: businessId,
      metadata: {
        business: business.name,
        ...counts,
        jobs_removed: jobsRemoved,
        whatsapp_cleared: whatsappCleared,
        executed_by: req.user!.sub,
      },
    });
    logger.warn("Reset de empresa executado pelo admin", {
      businessId,
      business: business.name,
      actor: req.user!.sub,
      jobs_removed: jobsRemoved,
    });

    return ok(res, {
      business_id: businessId,
      ...counts,
      jobs_removed: jobsRemoved,
      whatsapp_cleared: whatsappCleared,
    } as ResetCounts & { business_id: string; jobs_removed: number; whatsapp_cleared: boolean });
  }),
);

/**
 * Remove jobs PENDENTES (waiting/active/delayed/prioritized) das filas BullMQ
 * cujo payload pertença à empresa. Evita que jobs órfãos reprocessem dados já
 * apagados após um reset.
 */
async function removeBusinessJobs(businessId: string): Promise<number> {
  let removed = 0;
  for (const name of ALL_QUEUES) {
    try {
      const queue = getQueue(name);
      const jobs = await queue.getJobs([
        "waiting",
        "active",
        "delayed",
        "prioritized",
      ] as never);
      for (const job of jobs) {
        const data = job.data as Record<string, unknown>;
        const jobBusiness =
          data?.businessId ?? data?.business_id ?? data?.business;
        if (String(jobBusiness) === businessId) {
          await queue.remove(String(job.id));
          removed += 1;
        }
      }
    } catch (error) {
      logger.warn("Falha ao varrer fila no reset", {
        queue: name,
        error: (error as Error).message,
      });
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

/** GET /admin/plans — lista planos (com features). */
adminRouter.get(
  "/plans",
  asyncHandler(async (_req: Request, res: Response) => {
    const plans = await prisma.plan.findMany({
      include: { features: true },
      orderBy: { sort_order: "asc" },
    });
    const normalized = plans.map((p) => ({
      ...p,
      price: Number(p.price),
      features: p.features.map((f) => ({ ...f })),
    }));
    return ok(res, { plans: normalized });
  }),
);

/** POST /admin/plans — cria plano com features (PLATFORM_ADMIN). */
adminRouter.post(
  "/plans",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (!body.name || !body.slug)
      throw ApiError.badRequest("name e slug são obrigatórios");
    const price = Number(body.price ?? 0);
    if (!Number.isFinite(price) || price < 0)
      throw ApiError.badRequest("Preço inválido");
    const features = Array.isArray(body.features) ? body.features : [];
    const plan = await prisma.plan.create({
      data: {
        name: String(body.name),
        slug: String(body.slug),
        description: body.description ? String(body.description) : undefined,
        price,
        billing_interval:
          body.billing_interval === "YEARLY" ? "YEARLY" : "MONTHLY",
        trial_days: Number(body.trial_days ?? 0),
        active: body.active !== false,
        sort_order: Number(body.sort_order ?? 0),
        features: {
          create: features.map(
            (f: {
              feature: string;
              enabled?: boolean;
              limit?: number | null;
            }) => ({
              feature: String(f.feature),
              enabled: f.enabled !== false,
              limit: f.limit != null ? Number(f.limit) : null,
            }),
          ),
        },
      },
    });
    void writeAudit({
      actor: req.user!.sub,
      action: "admin.plan.created",
      entity: "Plan",
      entityId: plan.id,
      metadata: { slug: plan.slug, price },
    });
    return ok(res, plan, 201);
  }),
);

/** PATCH /admin/plans/:id — atualiza plano e features (PLATFORM_ADMIN). */
adminRouter.patch(
  "/plans/:id",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = req.body ?? {};
    const data: Record<string, unknown> = {};
    for (const key of [
      "name",
      "slug",
      "description",
      "billing_interval",
      "trial_days",
      "active",
      "sort_order",
      "stripe_product_id",
      "stripe_price_id",
    ] as const) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Plano não encontrado");

    let priceChanged = false;
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0)
        throw ApiError.badRequest("Preço inválido");
      data.price = price;
      priceChanged = price !== Number(existing.price);
    }

    // O checkout Cakto exibe o preço da OFERTA (pay.cakto.com.br/{offerId}),
    // não o Plan.price. Ao salvar o plano, sincroniza a oferta Cakto:
    // - preço mudou  -> falha BLOQUEIA (DB + gateway ficam consistentes);
    // - preço igual  -> falha só é logada (não bloqueia edições de outros
    //   campos, mas ainda corrige estado dessincronizado).
    if (body.price !== undefined && existing.cakto_offer_id && isCaktoConfigured()) {
      const priceToSync = Number(data.price);
      if (priceToSync > 0) {
        try {
          await updateCaktoOfferPrice(existing.cakto_offer_id, priceToSync);
        } catch (error) {
          if (priceChanged) throw error;
          logger.warn(
            "Falha ao sincronizar oferta Cakto (preço inalterado)",
            {
              offerId: existing.cakto_offer_id,
              error: (error as Error).message,
            },
          );
        }
      }
    }

    const plan = await prisma.plan.update({ where: { id }, data });

    // Assinaturas ainda NÃO contratadas (TRIALING) acompanham o preço atual do
    // plano: o valor exibido no checkout deve ser o que será cobrado. Uma vez
    // pago (ACTIVE), o snapshot fica congelado (valor contratado).
    let pendingUpdatedCount = 0;
    if (body.price !== undefined) {
      const priceToApply = Number(data.price);
      const pendingUpdated = await prisma.subscription.updateMany({
        where: { plan_id: id, status: "TRIALING" },
        data: { plan_price: priceToApply },
      });
      pendingUpdatedCount = pendingUpdated.count;
      if (pendingUpdated.count > 0) {
        logger.info("Preço do plano aplicado a assinaturas pendentes", {
          planId: id,
          price: priceToApply,
          count: pendingUpdated.count,
          actor: req.user!.sub,
        });
      }
    }

    if (Array.isArray(body.features)) {
      await prisma.planFeature.deleteMany({ where: { plan_id: id } });
      await prisma.planFeature.createMany({
        data: body.features.map(
          (f: {
            feature: string;
            enabled?: boolean;
            limit?: number | null;
          }) => ({
            plan_id: id,
            feature: String(f.feature),
            enabled: f.enabled !== false,
            limit: f.limit != null ? Number(f.limit) : null,
          }),
        ),
      });
    }
    void writeAudit({
      actor: req.user!.sub,
      action: "admin.plan.updated",
      entity: "Plan",
      entityId: id,
      metadata: {
        fields: Object.keys(data),
        features_replaced: Array.isArray(body.features),
        cakto_price_synced:
          body.price !== undefined &&
          Boolean(existing.cakto_offer_id) &&
          isCaktoConfigured(),
        pending_subscriptions_repriced: pendingUpdatedCount,
      },
    });
    const updated = await prisma.plan.findUnique({
      where: { id },
      include: { features: true },
    });
    return ok(res, {
      ...updated,
      price: updated ? Number(updated.price) : null,
    });
  }),
);

// ---------------------------------------------------------------------------
// Assinaturas
// ---------------------------------------------------------------------------

/** GET /admin/subscriptions?status= — lista assinaturas. */
adminRouter.get(
  "/subscriptions",
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const subs = await prisma.subscription.findMany({
      where: status ? { status: status as never } : {},
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            email: true,
            status: true,
          },
        },
        plan: { select: { name: true, slug: true, price: true } },
        _count: { select: { payments: true } },
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });
    return ok(
      res,
      subs.map((s) => ({
        ...s,
        plan_price: s.plan_price ? Number(s.plan_price) : null,
      })),
    );
  }),
);

/** GET /admin/subscriptions/:id — detalhe com histórico de pagamentos. */
adminRouter.get(
  "/subscriptions/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = await prisma.subscription.findUnique({
      where: { id: String(req.params.id) },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            email: true,
            status: true,
            cnpj: true,
            phone: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            description: true,
            active: true,
          },
        },
        payments: { orderBy: { created_at: "desc" as const } },
      },
    });
    if (!subscription) throw ApiError.notFound("Assinatura não encontrada");
    return ok(res, {
      ...subscription,
      plan_price: subscription.plan_price
        ? Number(subscription.plan_price)
        : null,
      payments: subscription.payments.map((p) => ({
        ...p,
        value: Number(p.value),
      })),
    });
  }),
);

/** POST /admin/subscriptions/:id/change-plan — troca o plano (PLATFORM_ADMIN). */
adminRouter.post(
  "/subscriptions/:id/change-plan",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const planId = String(req.body?.plan_id ?? "");
    if (!planId) throw ApiError.badRequest("Informe plan_id");
    const result = await changeSubscriptionPlan(id, planId);
    void writeAudit({
      actor: req.user!.sub,
      businessId: (result.subscription.business_id as string) ?? undefined,
      action: "admin.subscription.plan_changed",
      entity: "Subscription",
      entityId: id,
      metadata: {
        planId,
        warnings: result.warnings,
      },
    });
    return ok(res, result);
  }),
);

/** POST /admin/subscriptions/:id/cancel — cancela (PLATFORM_ADMIN). */
adminRouter.post(
  "/subscriptions/:id/cancel",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await cancelSubscription(id);
    void writeAudit({
      actor: req.user!.sub,
      businessId: (result.subscription.business_id as string) ?? undefined,
      action: "admin.subscription.cancelled",
      entity: "Subscription",
      entityId: id,
      metadata: { warnings: result.warnings },
    });
    return ok(res, result);
  }),
);

/** POST /admin/subscriptions/:id/reactivate — reativa cancelada/vencida (PLATFORM_ADMIN). */
adminRouter.post(
  "/subscriptions/:id/reactivate",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = await reactivateSubscription(id, {
      planId: req.body?.plan_id ? String(req.body.plan_id) : null,
    });
    void writeAudit({
      actor: req.user!.sub,
      businessId: (result.subscription.business_id as string) ?? undefined,
      action: "admin.subscription.reactivated",
      entity: "Subscription",
      entityId: id,
      metadata: { warnings: result.warnings },
    });
    return ok(res, result);
  }),
);

// ---------------------------------------------------------------------------
// Pagamentos
// ---------------------------------------------------------------------------

/** GET /admin/payments?status=&q=&from=&to= — lista pagamentos filtrados. */
adminRouter.get(
  "/payments",
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const q = req.query.q ? String(req.query.q) : undefined;
    const range = parseDateRange(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined,
    );

    const where: Record<string, unknown> = {
      ...(status ? { status: status as never } : {}),
      ...(range ? { created_at: { gte: range.from, lte: range.to } } : {}),
      ...(q
        ? {
            business: {
              OR: [
                { name: { contains: q, mode: "insensitive" as never } },
                { slug: { contains: q, mode: "insensitive" as never } },
              ],
            },
          }
        : {}),
    };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          business: { select: { id: true, name: true, slug: true } },
          subscription: { select: { id: true, plan_name: true, status: true } },
        },
        orderBy: { created_at: "desc" },
        take: 200,
      }),
      prisma.payment.count({ where }),
    ]);

    return ok(res, {
      payments: payments.map((p) => ({ ...p, value: Number(p.value) })),
      total,
    });
  }),
);

/**
 * POST /admin/payments/:id/reconcile — força a reconciliação do pagamento com o
 * gateway (Stripe): busca o status real e atualiza o
 * registro local (PLATFORM_ADMIN).
 */
adminRouter.post(
  "/payments/:id/reconcile",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const payment = await prisma.payment.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!payment) throw ApiError.notFound("Pagamento não encontrado");

    // Gateway atual: Stripe.
    if (!payment.stripe_payment_intent_id) {
      throw ApiError.badRequest("Pagamento sem stripe_payment_intent_id");
    }
    if (!isStripeConfigured())
      throw ApiError.badRequest("Stripe não configurado");

    const intent = await getStripe().paymentIntents.retrieve(
      payment.stripe_payment_intent_id,
    );
    const status = intent.status;
    const intentSubId = String(
      (intent as unknown as { subscription?: string | null }).subscription ??
        "",
    );

    // Reutiliza os handlers do webhook Stripe (mesma máquina de estados).
    if (status === "succeeded") {
      await processInvoicePaymentSucceeded({
        id: `in_${payment.stripe_payment_intent_id}`,
        subscription: intentSubId,
        payment_intent: payment.stripe_payment_intent_id,
        amount_paid: Number(intent.amount),
        paid_at: Math.floor(Date.now() / 1000),
      });
    } else {
      await processInvoicePaymentFailed({
        id: `in_${payment.stripe_payment_intent_id}`,
        subscription: intentSubId,
        payment_intent: payment.stripe_payment_intent_id,
        amount_due: Number(intent.amount),
      });
    }

    const updated = await prisma.payment.findUnique({
      where: { id: payment.id },
    });
    void writeAudit({
      actor: req.user!.sub,
      businessId: payment.business_id,
      action: "admin.payment.reconciled",
      entity: "Payment",
      entityId: payment.id,
      metadata: {
        stripe_status: status,
        to: updated?.status,
        provider: "stripe",
      },
    });
    return ok(res, {
      payment: updated ? { ...updated, value: Number(updated.value) } : null,
      gateway_status: status,
    });
  }),
);

// ---------------------------------------------------------------------------
// Uso (agregado de dados reais por período)
// ---------------------------------------------------------------------------

/** GET /admin/usage?from=&to=&businessId= — consumo agregado por empresa. */
adminRouter.get(
  "/usage",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.query.businessId
      ? String(req.query.businessId)
      : undefined;
    const range = parseDateRange(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined,
    );
    if (!range) throw ApiError.badRequest("Datas inválidas. Use YYYY-MM-DD.");

    const businesses = await prisma.business.findMany({
      where: businessId ? { id: businessId } : {},
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });

    const metrics = await Promise.all(
      businesses.map(async (b) => {
        const [
          messagesSent,
          messagesReceived,
          conversations,
          aiGenerations,
          aiInputTokens,
          aiOutputTokens,
          leads,
          optOuts,
        ] = await Promise.all([
          prisma.message.count({
            where: {
              business_id: b.id,
              direction: "OUT",
              created_at: { gte: range.from, lte: range.to },
            },
          }),
          prisma.message.count({
            where: {
              business_id: b.id,
              direction: "IN",
              created_at: { gte: range.from, lte: range.to },
            },
          }),
          prisma.conversation.count({
            where: {
              business_id: b.id,
              created_at: { gte: range.from, lte: range.to },
            },
          }),
          prisma.aIGeneration.count({
            where: {
              business_id: b.id,
              created_at: { gte: range.from, lte: range.to },
            },
          }),
          prisma.aIGeneration.aggregate({
            where: {
              business_id: b.id,
              created_at: { gte: range.from, lte: range.to },
            },
            _sum: { input_tokens: true },
          }),
          prisma.aIGeneration.aggregate({
            where: {
              business_id: b.id,
              created_at: { gte: range.from, lte: range.to },
            },
            _sum: { output_tokens: true },
          }),
          prisma.lead.count({
            where: {
              business_id: b.id,
              created_at: { gte: range.from, lte: range.to },
            },
          }),
          prisma.optOut.count({
            where: {
              business_id: b.id,
              created_at: { gte: range.from, lte: range.to },
            },
          }),
        ]);
        return {
          business_id: b.id,
          business_name: b.name,
          business_slug: b.slug,
          messages_sent: messagesSent,
          messages_received: messagesReceived,
          conversations,
          ai_generations: aiGenerations,
          ai_input_tokens: aiInputTokens._sum.input_tokens ?? 0,
          ai_output_tokens: aiOutputTokens._sum.output_tokens ?? 0,
          leads_created: leads,
          opt_outs: optOuts,
        };
      }),
    );

    return ok(res, { usage: metrics });
  }),
);

// ---------------------------------------------------------------------------
// Auditoria (paginada)
// ---------------------------------------------------------------------------

/** GET /admin/audit?page=&pageSize=&businessId=&action= — log paginado. */
adminRouter.get(
  "/audit",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.query.businessId
      ? String(req.query.businessId)
      : undefined;
    const action = req.query.action ? String(req.query.action) : undefined;
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize ?? 50) || 50),
    );

    const where: Record<string, unknown> = {
      ...(businessId ? { business_id: businessId } : {}),
      // contains: permite buscar por trecho do código técnico (ex.: "payment")
      // — o frontend também traduz o texto digitado para o código.
      ...(action ? { action: { contains: action } } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Resolve nomes legíveis (actor, empresa, assinatura, usuário) em lote —
    // a tela mostra nomes, mas os IDs técnicos seguem intactos nos dados.
    const resolved = await resolveAuditLogs(logs);

    return ok(res, { logs: resolved, total, page, pageSize });
  }),
);

/** Resolve nomes de atores e entidades dos logs de auditoria (em lote). */
async function resolveAuditLogs(
  logs: Array<{
    id: string;
    actor: string | null;
    business_id: string | null;
    action: string;
    entity: string | null;
    entity_id: string | null;
    metadata: unknown;
    created_at: Date;
  }>,
): Promise<Array<Record<string, unknown>>> {
  const actorIds = [
    ...new Set(logs.map((l) => l.actor).filter((v): v is string => Boolean(v))),
  ];
  const businessIds = [
    ...new Set(
      logs
        .flatMap((l) => [l.business_id, l.entity === "Business" ? l.entity_id : null])
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const userIds = [
    ...new Set(
      logs
        .filter((l) => l.entity === "User")
        .map((l) => l.entity_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const subIds = [
    ...new Set(
      logs
        .filter((l) => l.entity === "Subscription")
        .map((l) => l.entity_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const [users, businesses, subs] = await Promise.all([
    actorIds.length || userIds.length
      ? prisma.user.findMany({
          where: { id: { in: [...new Set([...actorIds, ...userIds])] } },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
    businessIds.length
      ? prisma.business.findMany({
          where: { id: { in: businessIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    subIds.length
      ? prisma.subscription.findMany({
          where: { id: { in: subIds } },
          select: {
            id: true,
            business_id: true,
            plan_name: true,
            plan: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const businessMap = new Map(businesses.map((b) => [b.id, b]));
  const subMap = new Map(
    subs.map((s) => [s.id, s]),
  );

  const userName = (id: string): string | null => {
    const u = userMap.get(id);
    if (!u) return null;
    return u.email || u.name || id;
  };

  return logs.map((l) => ({
    ...l,
    actor_name: l.actor ? userName(l.actor) : null,
    entity_name: (() => {
      if (!l.entity || !l.entity_id) return null;
      if (l.entity === "Business") {
        return businessMap.get(l.entity_id)?.name ?? null;
      }
      if (l.entity === "User") {
        return userName(l.entity_id);
      }
      if (l.entity === "Subscription") {
        const sub = subMap.get(l.entity_id);
        if (!sub) return null;
        const business = businessMap.get(sub.business_id)?.name ?? sub.business_id;
        const plan = sub.plan?.name ?? sub.plan_name ?? null;
        return plan ? `Assinatura de ${business} (${plan})` : `Assinatura de ${business}`;
      }
      return null;
    })(),
  }));
}

// ---------------------------------------------------------------------------
// Usuários da plataforma
// ---------------------------------------------------------------------------

/** GET /admin/users — usuários (sem hash de senha). */
adminRouter.get(
  "/users",
  asyncHandler(async (_req: Request, res: Response) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        platform_role: true,
        active: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });
    return ok(res, { users });
  }),
);

/** GET /admin/users/:id — detalhe com memberships. */
adminRouter.get(
  "/users/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        platform_role: true,
        active: true,
        must_change_password: true,
        created_at: true,
        memberships: {
          include: {
            business: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
      },
    });
    if (!user) throw ApiError.notFound("Usuário não encontrado");
    return ok(res, { user });
  }),
);

/**
 * PATCH /admin/users/:id — promove/rebaixa plataforma, ativa/desativa conta,
 * adiciona/atualiza membership. Restrito a PLATFORM_ADMIN. Inclui anti-lockout:
 * um admin não pode se rebaixar nem se desativar se for o último PLATFORM_ADMIN.
 */
adminRouter.patch(
  "/users/:id",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = req.body ?? {};
    const actor = req.user!;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw ApiError.notFound("Usuário não encontrado");

    const data: Record<string, unknown> = {};

    if (body.platform_role !== undefined) {
      const newRole = normalizePlatformRole(body.platform_role);
      if (!newRole) throw ApiError.badRequest("platform_role inválido");
      const platformAdminCount = await prisma.user.count({
        where: { platform_role: "PLATFORM_ADMIN" },
      });
      const lockError = validatePlatformRoleChange({
        actorRole: actor.platform_role ?? "NONE",
        targetId: id,
        actorId: actor.sub,
        platformAdminCount,
        targetIsPlatformAdmin: target.platform_role === "PLATFORM_ADMIN",
        newRole,
      });
      if (lockError) throw ApiError.badRequest(lockError);
      data.platform_role = newRole;
    }

    if (body.active !== undefined) {
      const active = Boolean(body.active);
      if (active === false) {
        // Anti-lockout: não se desativar se for o último admin.
        const platformAdminCount = await prisma.user.count({
          where: { platform_role: "PLATFORM_ADMIN" },
        });
        if (
          id === actor.sub &&
          target.platform_role === "PLATFORM_ADMIN" &&
          platformAdminCount <= 1
        ) {
          throw ApiError.badRequest(
            "Não é possível: você é o último admin da plataforma.",
          );
        }
      }
      data.active = active;
    }

    if (body.business_id && body.business_role) {
      const role = normalizeBusinessRole(body.business_role);
      if (!role) throw ApiError.badRequest("business_role inválido");
      const business = await prisma.business.findUnique({
        where: { id: String(body.business_id) },
      });
      if (!business) throw ApiError.notFound("Empresa não encontrada");
      await prisma.businessMember.upsert({
        where: {
          business_id_user_id: { business_id: business.id, user_id: id },
        },
        update: { role: role as never },
        create: { business_id: business.id, user_id: id, role: role as never },
      });
    }

    if (body.remove_business_id) {
      await prisma.businessMember.deleteMany({
        where: { business_id: String(body.remove_business_id), user_id: id },
      });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        platform_role: true,
        active: true,
      },
    });

    void writeAudit({
      actor: actor.sub,
      action: "admin.user.updated",
      entity: "User",
      entityId: id,
      metadata: {
        fields: Object.keys(data),
        membership: body.business_id
          ? { business_id: body.business_id, role: body.business_role }
          : undefined,
      },
    });
    return ok(res, { user });
  }),
);

/** POST /admin/users — cria usuário da plataforma (PLATFORM_ADMIN). */
adminRouter.post(
  "/users",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const email = String(body.email ?? "")
      .toLowerCase()
      .trim();
    const password = String(body.password ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw ApiError.badRequest("E-mail inválido");
    const strength = validatePasswordStrength(password);
    if (strength) throw ApiError.badRequest(strength);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw ApiError.conflict("E-mail já em uso");

    const user = await prisma.user.create({
      data: {
        email,
        password_hash: await hashPassword(password),
        name: String(body.name ?? email.split("@")[0]).slice(0, 60),
        role: "ADMIN",
        platform_role:
          body.platform_role === "PLATFORM_ADMIN" ? "PLATFORM_ADMIN" : "NONE",
        active: body.active !== false,
        must_change_password: true,
      },
    });
    void writeAudit({
      actor: req.user!.sub,
      action: "admin.user.created",
      entity: "User",
      entityId: user.id,
      metadata: { email },
    });
    return ok(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          platform_role: user.platform_role,
          active: user.active,
        },
      },
      201,
    );
  }),
);

// ---------------------------------------------------------------------------
// Impersonation / Suporte (apenas PLATFORM_ADMIN)
// ---------------------------------------------------------------------------

/** GET /admin/support-sessions — sessões de suporte registradas. */
adminRouter.get(
  "/support-sessions",
  asyncHandler(async (_req: Request, res: Response) => {
    const sessions = await prisma.auditLog.findMany({
      where: {
        OR: [
          { action: "support.session_started" },
          { action: "support.session_ended" },
        ],
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return ok(res, { sessions });
  }),
);

/** POST /admin/impersonate — entra na empresa como suporte (PLATFORM_ADMIN). */
adminRouter.post(
  "/impersonate",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = String(req.body?.business_id ?? "");
    const reason = String(req.body?.reason ?? "").slice(0, 500);
    if (!businessId) throw ApiError.badRequest("Informe business_id");

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) throw ApiError.notFound("Empresa não encontrada");

    const actor = req.user!;
    const token = await signToken({
      sub: actor.sub,
      email: actor.email,
      role: actor.role,
      must_change_password: false,
      platform_role: actor.platform_role,
      businessId,
      businessRole: "OWNER",
      impersonating: true,
      impersonator: actor.email,
      impersonationReason: reason,
    });

    await writeAudit({
      actor: actor.sub,
      businessId,
      action: "support.session_started",
      entity: "Business",
      entityId: businessId,
      metadata: {
        admin_email: actor.email,
        ip: req.ip,
        reason,
        active: true,
      },
    });

    logger.info("Impersonation iniciada pelo admin", {
      admin: actor.email,
      businessId,
    });
    return ok(res, {
      token,
      business: { id: business.id, name: business.name, slug: business.slug },
      impersonating: true,
    });
  }),
);

/** POST /admin/impersonate/exit — encerra a sessão de suporte atual (PLATFORM_ADMIN). */
adminRouter.post(
  "/impersonate/exit",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const actor = req.user!;
    const businessId = actor.businessId;
    if (businessId) {
      await writeAudit({
        actor: actor.sub,
        businessId,
        action: "support.session_ended",
        entity: "Business",
        entityId: businessId,
        metadata: {
          admin_email: actor.impersonator ?? actor.email,
          active: false,
        },
      });
    }
    // Derruba o cookie: signa token sem businessId (volta ao painel admin)
    const token = await signToken({
      sub: actor.sub,
      email: actor.email,
      role: actor.role,
      must_change_password: false,
      platform_role: actor.platform_role,
    });
    return ok(res, { token, exited: true });
  }),
);

// ---------------------------------------------------------------------------
// Configurações da plataforma (PLATFORM_ADMIN p/ escrita)
// ---------------------------------------------------------------------------

/** GET /admin/settings — pares chave/valor da plataforma. */
adminRouter.get(
  "/settings",
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await prisma.setting.findMany();
    return ok(res, { settings: rows });
  }),
);

/** PATCH /admin/settings — grava chave/valor (PLATFORM_ADMIN). */
adminRouter.patch(
  "/settings",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const { key, value } = req.body ?? {};
    if (!key) throw ApiError.badRequest("Informe key");
    await prisma.setting.upsert({
      where: { key: String(key) },
      update: { value: String(value ?? "") },
      create: { key: String(key), value: String(value ?? "") },
    });
    void writeAudit({
      actor: req.user!.sub,
      action: "admin.settings.updated",
      entity: "Setting",
      entityId: String(key),
    });
    return ok(res, { saved: true });
  }),
);

/** DELETE /admin/settings/:key — remove chave (PLATFORM_ADMIN). */
adminRouter.delete(
  "/settings/:key",
  adminWrite,
  asyncHandler(async (req: Request, res: Response) => {
    const key = String(req.params.key);
    await prisma.setting.delete({ where: { key } }).catch(() => {});
    void writeAudit({
      actor: req.user!.sub,
      action: "admin.settings.deleted",
      entity: "Setting",
      entityId: key,
    });
    return ok(res, { deleted: true });
  }),
);
