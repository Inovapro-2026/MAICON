import { Router, Request, Response } from "express";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { asyncHandler, ok, ApiError } from "../lib/http";
import { requireAuth, requireBusiness } from "../middleware/auth";
import { getSubscriptionData } from "../services/billing";
import {
  createStripeCheckout,
  StripeNotConfiguredError,
} from "../services/stripe-billing";
import { getPublishableKey, isStripeConfigured } from "../services/stripe";
import {
  createCaktoCheckout,
} from "../services/cakto-billing";
import {
  isCaktoConfigured,
  CaktoNotConfiguredError,
} from "../services/cakto";
import { writeAudit } from "../services/audit";

const logger = createLogger("api.billing");

export const billingRouter = Router();

billingRouter.use(requireAuth, requireBusiness);

/**
 * GET /billing/status — estado da assinatura e do último pagamento da empresa
 * ativa. Deriva businessId do token (nunca de query/body).
 */
billingRouter.get(
  "/status",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) throw ApiError.notFound("Empresa não encontrada");

    const subscription = await getSubscriptionData(businessId);
    const lastPayment = subscription?.payments?.[0] ?? null;

    // Preço ATUAL do plano (fonte autoritativa = Plan), com fallback para o
    // snapshot da assinatura (evita exibir valor antigo quando o plano muda).
    let currentPlanPrice: number | null = null;
    if (subscription?.plan_id) {
      const plan = await prisma.plan.findUnique({
        where: { id: subscription.plan_id },
        select: { price: true },
      });
      currentPlanPrice = plan ? Number(plan.price) : null;
    }

    // Vencimento: assinatura ativa com período final no passado = expirada.
    const isExpired = Boolean(
      subscription?.current_period_end &&
        subscription.current_period_end.getTime() < Date.now(),
    );

    return ok(res, {
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        status: business.status,
      },
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            plan_name: subscription.plan_name,
            plan_price:
              currentPlanPrice ??
              (subscription.plan_price ? Number(subscription.plan_price) : null),
            current_period_end: subscription.current_period_end,
            expires_at: subscription.current_period_end,
            is_expired: isExpired,
            stripe_customer_id: subscription.stripe_customer_id,
            stripe_subscription_id: subscription.stripe_subscription_id,
            cakto_subscription_id: subscription.cakto_subscription_id,
            cakto_checkout_url: subscription.cakto_checkout_url,
          }
        : null,
      last_payment: lastPayment
        ? {
            id: lastPayment.id,
            method: lastPayment.method,
            status: lastPayment.status,
            value: Number(lastPayment.value),
            created_at: lastPayment.created_at,
            stripe_payment_intent_id: lastPayment.stripe_payment_intent_id,
            cakto_order_id: lastPayment.cakto_order_id,
          }
        : null,
      requires_payment: business.status === "PENDING_PAYMENT",
      is_expired: isExpired,
      stripe_configured: isStripeConfigured(),
      stripe_publishable_key: getPublishableKey(),
      cakto_configured: isCaktoConfigured(),
    });
  }),
);

/**
 * POST /billing/checkout — monta o link de pagamento para a empresa.
 * Usa o Cakto (link fixo pré-preenchido, PIX recorrente) quando configurado;
 * caso contrário, cai para o Checkout Stripe (legado). Idempotente.
 */
billingRouter.post(
  "/checkout",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;

    // Cakto é o gateway preferido (novo).
    if (isCaktoConfigured()) {
      try {
        const result = await createCaktoCheckout(businessId);
        void writeAudit({
          actor: req.user!.sub,
          businessId,
          action: "payment.checkout_url_created",
          entity: "Payment",
          entityId: result.paymentId,
          metadata: { provider: "cakto", amount: result.amount, offer: result.offerId },
        });
        return ok(res, result);
      } catch (error) {
        if (error instanceof CaktoNotConfiguredError) throw error;
        throw ApiError.badRequest((error as Error).message);
      }
    }

    // Fallback: Stripe (gateway legado).
    try {
      const result = await createStripeCheckout(businessId);
      void writeAudit({
        actor: req.user!.sub,
        businessId,
        action: "payment.checkout_session_created",
        entity: "Payment",
        entityId: result.paymentId,
        metadata: { provider: "stripe", amount: result.amount },
      });
      return ok(res, result);
    } catch (error) {
      if (error instanceof StripeNotConfiguredError) throw error;
      throw ApiError.badRequest((error as Error).message);
    }
  }),
);

/**
 * POST /billing/activate-free — ativa a empresa quando o plano contratado é
 * gratuito (preço 0). Idempotente e validado no backend: nunca ativa planos pagos.
 */
billingRouter.post(
  "/activate-free",
  asyncHandler(async (req: Request, res: Response) => {
    const businessId = req.user!.businessId!;
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) throw ApiError.notFound("Empresa não encontrada");

    const subscription = await prisma.subscription.findUnique({
      where: { business_id: businessId },
    });
    const plan = subscription?.plan_id
      ? await prisma.plan.findUnique({ where: { id: subscription.plan_id } })
      : null;
    const price = Number(subscription?.plan_price ?? plan?.price ?? 0);
    if (price > 0) {
      throw ApiError.forbidden("Este plano exige pagamento. Use o checkout.");
    }

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const tx = await prisma.$transaction([
      prisma.subscription.update({
        where: { business_id: businessId },
        data: {
          status: "ACTIVE",
          current_period_start: new Date(),
          current_period_end: periodEnd,
        },
      }),
      prisma.business.update({
        where: { id: businessId },
        data: { status: "ACTIVE" },
      }),
    ]);

    void writeAudit({
      actor: req.user!.sub,
      businessId,
      action: "business.activated_free_plan",
      entity: "Business",
      entityId: businessId,
    });

    void tx;
    return ok(res, { activated: true });
  }),
);
