/**
 * Billing/Onboarding — SAVYRON.
 * Criação de empresa + assinatura e gestão de assinatura pelo admin.
 * O pagamento é processado pelo Stripe (services/stripe-billing.ts).
 *
 * Regras críticas:
 * - NUNCA confiar em businessId vindo do frontend sem validação.
 * - Só ativar a empresa quando o gateway confirmar o pagamento.
 */
import { prisma, PrismaClient } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { ApiError } from "../lib/http";

const logger = createLogger("api.billing");

export interface BillingPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  billingInterval: string;
  trialDays: number;
  features: { feature: string; enabled: boolean; limit: number | null }[];
}

/** Lista os planos ativos para novos cadastros (apenas planos pagos). */
export async function listActivePlans(): Promise<BillingPlan[]> {
  const plans = await prisma.plan.findMany({
    where: { active: true, price: { gt: 0 } },
    include: { features: true },
    orderBy: { sort_order: "asc" },
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: Number(p.price),
    billingInterval: p.billing_interval,
    trialDays: p.trial_days,
    features: p.features.map((f) => ({
      feature: f.feature,
      enabled: f.enabled,
      limit: f.limit,
    })),
  }));
}

/** Busca dados da assinatura de uma empresa para uso no painel/pagamento. */
export async function getSubscriptionData(businessId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { business_id: businessId },
    include: { payments: { orderBy: { created_at: "desc" as const } } },
  });
  return subscription;
}

/**
 * Verifica se o plano da assinatura ativa da empresa habilita uma feature.
 * Usado para restringir funcionalidades por plano (ex.: prospeccao_web).
 * Validação real no backend — nunca confiar apenas na interface.
 */
export async function planAllowsFeature(
  businessId: string,
  feature: string,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const result = await checkFeatureAccess(businessId, feature, undefined, db);
  return result.allowed;
}

export interface FeatureAccessResult {
  allowed: boolean;
  /** true quando liberado por ser PLATFORM_ADMIN (acesso total, ignora plano). */
  adminBypass: boolean;
}

/**
 * Ponto único de checagem de acesso por feature de plano.
 *
 * REGRA: qualquer usuário com `platform_role = PLATFORM_ADMIN` tem ACESSO
 * TOTAL à plataforma e ignora restrições de plano/billing (ex.: prospecção
 * web restrita ao plano Empresa). A checagem é feita pelo papel, nunca por
 * e-mail hardcoded. A validação de segurança (rate limit, dados) continua
 * valendo — só os bloqueios de plano são ignorados.
 */
export async function checkFeatureAccess(
  businessId: string,
  feature: string,
  actor?: { platform_role?: string | null; sub?: string },
  db: PrismaClient = prisma,
): Promise<FeatureAccessResult> {
  // PLATFORM_ADMIN tem acesso total — libera sem consultar Subscription/Plan.
  if (actor?.platform_role === "PLATFORM_ADMIN") {
    return { allowed: true, adminBypass: true };
  }
  const subscription = await db.subscription.findUnique({
    where: { business_id: businessId },
    select: { plan_id: true },
  });
  if (!subscription?.plan_id) return { allowed: false, adminBypass: false };
  const planFeature = await db.planFeature.findUnique({
    where: {
      plan_id_feature: { plan_id: subscription.plan_id, feature },
    },
  });
  return { allowed: planFeature?.enabled === true, adminBypass: false };
}

// ---------------------------------------------------------------------------
// Gestão de assinatura pelo admin (Fase 3.1) — muda/cancela/reativa.
// ---------------------------------------------------------------------------

export interface SubscriptionActionResult {
  subscription: Record<string, unknown>;
  warnings: string[];
}

/**
 * Troca o plano de uma assinatura. Atualiza o snapshot local (plan_name/
 * plan_price). NUNCA altera planos de OUTRAS assinaturas (snapshot por assinatura).
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  planId: string,
): Promise<SubscriptionActionResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription) throw ApiError.notFound("Assinatura não encontrada");

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw ApiError.notFound("Plano não encontrado");

  const price = Number(plan.price);

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { plan_id: planId, plan_name: plan.name, plan_price: price },
  });

  return { subscription: verifiedSubscription(updated), warnings: [] };
}

/**
 * Troca o plano de uma EMPRESA (busca a assinatura ativa pelo business_id).
 * Quando a assinatura já existe, reutiliza changeSubscriptionPlan (MESMA lógica
 * de /admin/subscriptions) — que mantém o status atual (ACTIVE continua ACTIVE),
 * NUNCA transitando para PENDING_PAYMENT (isso só ocorre em novo cadastro).
 * Quando a empresa não tem assinatura, cria uma e ATIVA a empresa (ação
 * administrativa de cortesia — não gera cobrança automática).
 */
export async function changeBusinessPlan(
  businessId: string,
  planId: string,
): Promise<SubscriptionActionResult> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw ApiError.notFound("Plano não encontrado");

  let subscription = await prisma.subscription.findUnique({
    where: { business_id: businessId },
  });
  if (!subscription) {
    const created = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          business_id: businessId,
          plan_id: planId,
          plan_name: plan.name,
          plan_price: plan.price,
          status: "ACTIVE",
          current_period_start: new Date(),
          current_period_end: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ),
        },
      });
      // Plano atribuído pelo admin = ativação administrativa da empresa
      // (evita que ela fique PENDING_PAYMENT e caia em /payment no login).
      await tx.business.update({
        where: { id: businessId },
        data: { status: "ACTIVE" },
      });
      return sub;
    });
    logger.info("Assinatura criada via admin (troca de plano)", {
      businessId,
      planId,
    });
    return { subscription: verifiedSubscription(created), warnings: [] };
  }

  return changeSubscriptionPlan(subscription.id, planId);
}

/** Cancela a assinatura local (e o vínculo Stripe, se houver). */
export async function cancelSubscription(
  subscriptionId: string,
): Promise<SubscriptionActionResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription) throw ApiError.notFound("Assinatura não encontrada");

  const warnings: string[] = [];

  // Se houver assinatura Stripe ativa, cancela no gateway (best-effort).
  if (subscription.stripe_subscription_id) {
    try {
      const { cancelStripeSubscription } = await import("./stripe-billing");
      await cancelStripeSubscription(subscription.stripe_subscription_id);
    } catch (error) {
      warnings.push(
        `Assinatura Stripe não cancelada no gateway: ${(error as Error).message}`,
      );
    }
  }

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: "CANCELLED", cancelled_at: new Date() },
  });

  return { subscription: verifiedSubscription(updated), warnings };
}

/**
 * Reativa uma assinatura cancelada/vencida. Restaura ACTIVE + novo período.
 */
export async function reactivateSubscription(
  subscriptionId: string,
  options: { planId?: string | null } = {},
): Promise<SubscriptionActionResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription) throw ApiError.notFound("Assinatura não encontrada");
  if (
    subscription.status !== "CANCELLED" &&
    subscription.status !== "EXPIRED"
  ) {
    throw ApiError.badRequest(
      "Apenas assinaturas canceladas/vencidas podem ser reativadas",
    );
  }

  let plan =
    options.planId != null
      ? await prisma.plan.findUnique({ where: { id: options.planId } })
      : subscription.plan_id
        ? await prisma.plan.findUnique({ where: { id: subscription.plan_id } })
        : null;
  if (options.planId != null && !plan)
    throw ApiError.notFound("Plano não encontrado");

  const price = plan
    ? Number(plan.price)
    : Number(subscription.plan_price ?? 0);

  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: "ACTIVE",
      plan_id: plan?.id ?? subscription.plan_id,
      plan_name: plan?.name ?? subscription.plan_name,
      plan_price: price,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancelled_at: null,
    },
  });

  return { subscription: verifiedSubscription(updated), warnings: [] };
}

/** Serializa assinatura sem Decimal cru (para resposta da API). */
function verifiedSubscription(s: {
  id: string;
  plan_name: string | null;
  plan_price: unknown;
  status: string;
  [k: string]: unknown;
}): Record<string, unknown> {
  return {
    ...s,
    plan_price: s.plan_price != null ? Number(s.plan_price) : null,
  };
}
