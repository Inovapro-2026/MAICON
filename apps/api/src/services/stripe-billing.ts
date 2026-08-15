/**
 * Billing Stripe (SAVYRON) — lógica de negócio do gateway.
 *
 * Máquina de estados:
 *  - PENDING_PAYMENT -> ACTIVE só com confirmação real do gateway.
 *  - Nunca ativar sem invoice.payment_succeeded / checkout.session.completed
 *    com payment_status "paid".
 *  - Customer nunca duplicado (stripe_customer_id gravado na Subscription).
 */
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import {
  getStripe,
  isStripeConfigured,
  createStripeCustomer,
  createCheckoutSession,
  retrieveCheckoutSession,
  cancelStripeSubscription,
  mapStripeSubscriptionStatus,
  STRIPE_WEBHOOK_EVENTS,
  StripeWebhookEventType,
} from "./stripe";
import { writeAudit } from "./audit";

const logger = createLogger("api.stripe-billing");

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe não configurado (STRIPE_SECRET_KEY ausente)");
    this.name = "StripeNotConfiguredError";
  }
}

/** Garante o customer Stripe da empresa (nunca duplica). */
export async function ensureStripeCustomer(
  businessId: string,
): Promise<string> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });
  if (!business) throw new Error("Empresa não encontrada");

  const sub = await prisma.subscription.findUnique({
    where: { business_id: businessId },
  });
  if (sub?.stripe_customer_id) return sub.stripe_customer_id;

  if (!isStripeConfigured()) throw new StripeNotConfiguredError();

  const customerId = await createStripeCustomer({
    name: business.name || business.email || "Cliente SAVYRON",
    email: business.email || "",
    metadata: { business_id: businessId },
  });

  if (sub) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { stripe_customer_id: customerId },
    });
  }
  return customerId;
}

export interface StripeCheckoutResult {
  url: string;
  paymentId: string;
  amount: number;
  priceId: string;
}

/**
 * Cria o Checkout Session (hospedado) para a empresa.
 * Idempotente: reutiliza pagamento PENDING vinculado a um checkout pendente.
 */
export async function createStripeCheckout(
  businessId: string,
): Promise<StripeCheckoutResult> {
  if (!isStripeConfigured()) throw new StripeNotConfiguredError();

  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });
  if (!business) throw new Error("Empresa não encontrada");

  const subscription = await prisma.subscription.findUnique({
    where: { business_id: businessId },
  });
  if (!subscription)
    throw new Error("Assinatura não configurada para o cadastro");

  const plan = subscription.plan_id
    ? await prisma.plan.findUnique({ where: { id: subscription.plan_id } })
    : null;
  const price = Number(subscription.plan_price ?? plan?.price ?? 0);
  if (price <= 0) {
    throw new Error("Este plano é gratuito e não exige cobrança");
  }

  const priceId = subscription.stripe_price_id || plan?.stripe_price_id;
  if (!priceId) {
    throw new Error("Plano sem stripe_price_id configurado no Stripe");
  }

  // Idempotência: se já existe checkout pendente para esta empresa, reutiliza.
  const existing = await prisma.payment.findFirst({
    where: {
      business_id: businessId,
      status: "PENDING",
      stripe_checkout_session_id: { not: null },
    },
  });
  if (existing?.stripe_checkout_session_id) {
    try {
      const session = await retrieveCheckoutSession(
        existing.stripe_checkout_session_id,
      );
      if (session.url) {
        return {
          url: session.url,
          paymentId: existing.id,
          amount: Number(existing.value),
          priceId,
        };
      }
    } catch {
      /* session expirada/inexistente — cria nova */
    }
  }

  const customerId = await ensureStripeCustomer(businessId);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.DASHBOARD_URL ||
    "https://crm.inovapro.cloud";

  const session = await createCheckoutSession({
    customerId,
    priceId,
    businessId,
    successUrl: `${baseUrl}/payment?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/payment?status=cancelled`,
    metadata: { business_id: businessId },
  });

  const payment = await prisma.payment.create({
    data: {
      subscription_id: subscription.id,
      business_id: businessId,
      stripe_checkout_session_id: session.id,
      method: "PIX",
      status: "PENDING",
      value: price,
      external_reference: businessId,
    },
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { stripe_price_id: priceId },
  });

  return {
    url: session.url || `${baseUrl}/payment?status=cancelled`,
    paymentId: payment.id,
    amount: price,
    priceId,
  };
}

/**
 * checkout.session.completed — vincula customer/subscription e ativa se pago.
 */
export async function processCheckoutCompleted(
  sessionId: string,
): Promise<void> {
  const session = await retrieveCheckoutSession(sessionId);
  const businessId = String(
    session.client_reference_id ||
      (session.metadata as Record<string, string> | null)?.business_id ||
      "",
  );

  const subscription = businessId
    ? await prisma.subscription.findUnique({
        where: { business_id: businessId },
      })
    : null;

  if (!subscription) {
    logger.warn("checkout.session.completed sem assinatura local", {
      sessionId,
      businessId,
    });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (typeof session.customer === "string")
    updates.stripe_customer_id = session.customer;
  if (
    session.subscription &&
    typeof session.subscription === "object" &&
    "id" in session.subscription
  ) {
    updates.stripe_subscription_id = session.subscription.id;
  } else if (typeof session.subscription === "string") {
    updates.stripe_subscription_id = session.subscription;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: updates,
  });

  // Payment local já existe (criado no checkout) — vincula o intent.
  const payment = await prisma.payment.findFirst({
    where: { stripe_checkout_session_id: session.id },
  });

  const paid = session.payment_status === "paid";
  if (paid) {
    const ts = new Date();
    const paidAt =
      (session as unknown as { paid_at?: number | string }).paid_at ??
      Math.floor(ts.getTime() / 1000);
    const periodEnd = new Date(ts.getTime() + 30 * 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment?.id ?? "none" },
        data: {
          status: "RECEIVED",
          paid_at: new Date(Number(paidAt) * 1000),
          ...(session.payment_intent &&
          typeof session.payment_intent === "string"
            ? { stripe_payment_intent_id: session.payment_intent }
            : {}),
        },
      }),
      prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          current_period_start: ts,
          current_period_end: periodEnd,
        },
      }),
      prisma.business.update({
        where: { id: businessId },
        data: { status: "ACTIVE" },
      }),
    ]);

    await writeAudit({
      actor: "stripe-webhook",
      businessId,
      action: "payment.confirmed",
      entity: "Payment",
      entityId: payment?.id ?? sessionId,
      metadata: {
        stripe_session: sessionId,
        status: "RECEIVED",
        via: "checkout.session.completed",
      },
    });
    logger.info("Checkout Stripe concluído — empresa ativada", {
      businessId,
      sessionId,
    });
  }
}

/**
 * customer.subscription.created/updated — sincroniza status local.
 */
export async function processSubscriptionStatus(
  subscription: Record<string, unknown>,
): Promise<void> {
  const stripeSubId = String(subscription.id ?? "");
  if (!stripeSubId) return;

  const local = await prisma.subscription.findFirst({
    where: { stripe_subscription_id: stripeSubId },
  });
  if (!local) {
    logger.warn("Assinatura Stripe sem registro local", {
      stripe_subscription_id: stripeSubId,
    });
    return;
  }

  const status = mapStripeSubscriptionStatus(String(subscription.status ?? ""));
  const periodStart = subscription.current_period_start
    ? new Date(Number(subscription.current_period_start) * 1000)
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(Number(subscription.current_period_end) * 1000)
    : null;
  const cancelAt = subscription.canceled_at
    ? new Date(Number(subscription.canceled_at) * 1000)
    : null;

  await prisma.subscription.update({
    where: { id: local.id },
    data: {
      status,
      current_period_start: periodStart ?? local.current_period_start,
      current_period_end: periodEnd ?? local.current_period_end,
      cancelled_at:
        status === "CANCELLED" ? (cancelAt ?? new Date()) : local.cancelled_at,
      ...(subscription.plan ? {} : {}),
    },
  });

  // Rebaixa a empresa se a assinatura foi cancelada.
  if (status === "CANCELLED") {
    await prisma.business.updateMany({
      where: { id: local.business_id },
      data: { status: "PENDING_PAYMENT" },
    });
  }

  await writeAudit({
    actor: "stripe-webhook",
    businessId: local.business_id,
    action: "subscription.status_synced",
    entity: "Subscription",
    entityId: local.id,
    metadata: { stripe_subscription_id: stripeSubId, status },
  });
}

/**
 * customer.subscription.deleted — assinatura cancelada.
 */
export async function processSubscriptionDeleted(
  subscription: Record<string, unknown>,
): Promise<void> {
  const stripeSubId = String(subscription.id ?? "");
  const local = await prisma.subscription.findFirst({
    where: { stripe_subscription_id: stripeSubId },
  });
  if (!local) return;

  await prisma.subscription.update({
    where: { id: local.id },
    data: { status: "CANCELLED", cancelled_at: new Date() },
  });
  await prisma.business.updateMany({
    where: { id: local.business_id },
    data: { status: "PENDING_PAYMENT" },
  });

  await writeAudit({
    actor: "stripe-webhook",
    businessId: local.business_id,
    action: "subscription.cancelled_by_gateway",
    entity: "Subscription",
    entityId: local.id,
    metadata: { stripe_subscription_id: stripeSubId },
  });
}

/**
 * invoice.payment_succeeded — confirma pagamento (renovação ou inicial) e ativa.
 */
export async function processInvoicePaymentSucceeded(
  invoice: Record<string, unknown>,
): Promise<void> {
  const stripeInvoiceId = String(invoice.id ?? "");
  const stripeSubId = String(invoice.subscription ?? "");
  const paymentIntentId = String(invoice.payment_intent ?? "");
  const amountPaid = Number(invoice.amount_paid ?? 0) / 100;

  let local = stripeSubId
    ? await prisma.subscription.findFirst({
        where: { stripe_subscription_id: stripeSubId },
      })
    : null;

  if (!local && paymentIntentId) {
    const payment = await prisma.payment.findUnique({
      where: { stripe_payment_intent_id: paymentIntentId },
    });
    if (payment)
      local = await prisma.subscription.findUnique({
        where: { id: payment.subscription_id },
      });
  }
  if (!local) {
    logger.warn("invoice.payment_succeeded sem assinatura local", {
      stripeInvoiceId,
      stripeSubId,
    });
    return;
  }

  const businessId = local.business_id;
  const ts = new Date();
  const periodEnd = new Date(ts.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Atualiza ou cria o Payment local (renovação cria registro novo).
  const existingPayment = paymentIntentId
    ? await prisma.payment.findUnique({
        where: { stripe_payment_intent_id: paymentIntentId },
      })
    : null;

  await prisma.$transaction(async (tx) => {
    if (existingPayment) {
      await tx.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: "RECEIVED",
          paid_at: invoice.paid_at
            ? new Date(Number(invoice.paid_at) * 1000)
            : ts,
        },
      });
    } else {
      await tx.payment.create({
        data: {
          subscription_id: local.id,
          business_id: businessId,
          stripe_payment_intent_id: paymentIntentId || undefined,
          method: "PIX",
          status: "RECEIVED",
          value: amountPaid || Number(local.plan_price ?? 0),
          paid_at: invoice.paid_at
            ? new Date(Number(invoice.paid_at) * 1000)
            : ts,
          external_reference: businessId,
        },
      });
    }
    await tx.subscription.update({
      where: { id: local.id },
      data: {
        status: "ACTIVE",
        current_period_start: ts,
        current_period_end: periodEnd,
      },
    });
    await tx.business.update({
      where: { id: businessId },
      data: { status: "ACTIVE" },
    });
  });

  await writeAudit({
    actor: "stripe-webhook",
    businessId,
    action: "payment.confirmed",
    entity: "Payment",
    entityId: existingPayment?.id ?? stripeInvoiceId,
    metadata: {
      stripe_invoice: stripeInvoiceId,
      status: "RECEIVED",
      via: "invoice.payment_succeeded",
    },
  });
  logger.info("Pagamento Stripe confirmado — empresa ativada", {
    businessId,
    stripeInvoiceId,
  });
}

/**
 * invoice.payment_failed — marca como atrasado, NÃO ativa.
 */
export async function processInvoicePaymentFailed(
  invoice: Record<string, unknown>,
): Promise<void> {
  const stripeSubId = String(invoice.subscription ?? "");
  const paymentIntentId = String(invoice.payment_intent ?? "");
  const local = stripeSubId
    ? await prisma.subscription.findFirst({
        where: { stripe_subscription_id: stripeSubId },
      })
    : null;
  if (!local) return;

  const payment = paymentIntentId
    ? await prisma.payment.findUnique({
        where: { stripe_payment_intent_id: paymentIntentId },
      })
    : null;

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "OVERDUE" },
    });
  } else {
    await prisma.payment.create({
      data: {
        subscription_id: local.id,
        business_id: local.business_id,
        stripe_payment_intent_id: paymentIntentId || undefined,
        method: "PIX",
        status: "OVERDUE",
        value: Number(invoice.amount_due ?? local.plan_price ?? 0) / 100,
        external_reference: local.business_id,
      },
    });
  }

  await writeAudit({
    actor: "stripe-webhook",
    businessId: local.business_id,
    action: "payment.failed",
    entity: "Payment",
    entityId: payment?.id ?? String(invoice.id ?? ""),
    metadata: { stripe_invoice: String(invoice.id ?? ""), status: "OVERDUE" },
  });
}

/** Dispatcher de eventos Stripe (retorna false se o tipo não é tratado). */
export async function handleStripeWebhookEvent(
  eventType: string,
  object: Record<string, unknown>,
): Promise<boolean> {
  const type = eventType as StripeWebhookEventType;
  if (!STRIPE_WEBHOOK_EVENTS.includes(type)) return false;

  switch (type) {
    case "checkout.session.completed":
      await processCheckoutCompleted(String(object.id ?? ""));
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await processSubscriptionStatus(object);
      break;
    case "customer.subscription.deleted":
      await processSubscriptionDeleted(object);
      break;
    case "invoice.payment_succeeded":
      await processInvoicePaymentSucceeded(object);
      break;
    case "invoice.payment_failed":
      await processInvoicePaymentFailed(object);
      break;
  }
  return true;
}

export { getStripe, cancelStripeSubscription };
