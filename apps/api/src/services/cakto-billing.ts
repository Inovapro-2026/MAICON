/**
 * Billing Cakto (SAVYRON) — lógica de negócio do novo gateway (PIX recorrente).
 *
 * Máquina de estados:
 *  - PENDING_PAYMENT -> ACTIVE só com confirmação real do gateway
 *    (purchase_approved / subscription_renewed).
 *  - Nunca ativar sem o evento de aprovação do Cakto.
 *  - Correlação compra->empresa via `sck=biz_{businessId}` (retorna em
 *    data.sck), com fallback por data.customer.email.
 *
 * Obs.: um mesmo pedido dispara `pix_gerado` e depois `purchase_approved` com
 * o MESMO data.id. Por isso a deduplicação usa (event, data.id) e não data.id
 * sozinho — senão a ativação seria ignorada como duplicada.
 */
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import {
  buildCaktoCheckoutUrl,
  isCaktoConfigured,
  CaktoNotConfiguredError,
} from "./cakto";
import { writeAudit } from "./audit";

const logger = createLogger("api.cakto-billing");

export interface CaktoCheckoutResult {
  url: string;
  paymentId: string;
  amount: number;
  offerId: string;
}

/** Extrai o businessId do `sck` (formato `biz_{businessId}`). */
export function businessIdFromSck(sck: unknown): string | null {
  if (typeof sck !== "string") return null;
  const m = /^biz_(.+)$/.exec(sck);
  return m ? m[1] : null;
}

/**
 * Cria/retorna a URL de checkout Cakto pré-preenchida para a empresa.
 * Link fixo (não cria pedido aqui): a correlação é feita no webhook via sck.
 * Idempotente: reutiliza cakto_checkout_url gravado na assinatura.
 */
export async function createCaktoCheckout(
  businessId: string,
): Promise<CaktoCheckoutResult> {
  if (!isCaktoConfigured()) throw new CaktoNotConfiguredError();

  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });
  if (!business) throw new Error("Empresa não encontrada");

  const subscription = await prisma.subscription.findUnique({
    where: { business_id: businessId },
  });
  if (!subscription) throw new Error("Assinatura não configurada para o cadastro");

  const plan = subscription.plan_id
    ? await prisma.plan.findUnique({ where: { id: subscription.plan_id } })
    : null;
  const price = Number(subscription.plan_price ?? plan?.price ?? 0);
  if (price <= 0) throw new Error("Este plano é gratuito e não exige cobrança");

  const offerId =
    subscription.cakto_offer_id || plan?.cakto_offer_id;
  if (!offerId) {
    throw new Error("Plano sem cakto_offer_id configurado no Cakto");
  }

  // Idempotente: se já há link fixo gravado, reutiliza.
  if (subscription.cakto_checkout_url) {
    return {
      url: subscription.cakto_checkout_url,
      paymentId: subscription.id,
      amount: price,
      offerId,
    };
  }

  const url = buildCaktoCheckoutUrl({
    offerId,
    businessId,
    name: business.name,
    email: business.email,
    cpfCnpj: business.cnpj,
    phone: business.phone,
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      cakto_checkout_url: url,
      cakto_offer_id: offerId,
      cakto_product_id: plan?.cakto_product_id || null,
    },
  });

  return { url, paymentId: subscription.id, amount: price, offerId };
}

interface CaktoEventData {
  id?: unknown;
  refId?: unknown;
  status?: unknown;
  baseAmount?: unknown;
  checkoutUrl?: unknown;
  customer?: { email?: unknown; name?: unknown; docNumber?: unknown };
  subscription?: unknown;
  offer?: { id?: unknown; price?: unknown };
  product?: { id?: unknown };
  sck?: unknown;
  utm_source?: unknown;
  utm_campaign?: unknown;
  utm_medium?: unknown;
}

/** Busca a assinatura local correspondente ao evento (sck -> email -> sub). */
async function resolveSubscription(
  data: CaktoEventData,
): Promise<{ subscription: Awaited<ReturnType<typeof prisma.subscription.findUnique>>; via: string } | null> {
  // 1) Por sck=biz_{businessId}
  const businessId = businessIdFromSck(data.sck);
  if (businessId) {
    const sub = await prisma.subscription.findUnique({
      where: { business_id: businessId },
    });
    if (sub) return { subscription: sub, via: "sck" };
  }

  // 2) Por data.subscription (id da assinatura Cakto já vinculada)
  const caktoSubId = extractId(data.subscription);
  if (caktoSubId) {
    const sub = await prisma.subscription.findFirst({
      where: { cakto_subscription_id: caktoSubId },
    });
    if (sub) return { subscription: sub, via: "subscription_id" };
  }

  const orderId = extractId(data.id);

  // 3) Por data.id tratado como id da assinatura Cakto (eventos de assinatura
  //    podem trazer o id no data.id, sem data.subscription).
  if (orderId) {
    const subBySubId = await prisma.subscription.findFirst({
      where: { cakto_subscription_id: orderId },
    });
    if (subBySubId) return { subscription: subBySubId, via: "subscription_id_from_data_id" };
  }

  // 4) Por pedido já registrado (data.id)
  if (orderId) {
    const payment = await prisma.payment.findUnique({
      where: { cakto_order_id: orderId },
    });
    if (payment) {
      const sub = await prisma.subscription.findUnique({
        where: { id: payment.subscription_id },
      });
      if (sub) return { subscription: sub, via: "order" };
    }
  }

  // 5) Fallback por email (verificado no onboarding)
  const email = data.customer?.email;
  if (typeof email === "string") {
    const sub = await prisma.subscription.findFirst({
      where: { business: { email: email.toLowerCase().trim() } },
    });
    if (sub) return { subscription: sub, via: "email" };
  }

  return null;
}

function extractId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}

function valueFromData(data: CaktoEventData): number {
  const amount = Number(data.baseAmount ?? data.offer?.price ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * pix_gerado — registra o pedido como PENDING (PIX) e grava referências Cakto.
 * NUNCA ativa.
 */
export async function processPixGerado(data: CaktoEventData): Promise<boolean> {
  const resolved = await resolveSubscription(data);
  if (!resolved) {
    logger.warn("pix_gerado sem assinatura local", {
      sck: data.sck,
      email: data.customer?.email,
    });
    return false;
  }
  const sub = resolved.subscription!;
  const orderId = extractId(data.id);
  const value = valueFromData(data);

  // Grava referências Cakto na assinatura (se ainda não houver).
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      ...(sub.cakto_offer_id ? {} : { cakto_offer_id: extractId(data.offer?.id) }),
      ...(sub.cakto_product_id ? {} : { cakto_product_id: extractId(data.product?.id) }),
    },
  });

  if (orderId) {
    const existing = await prisma.payment.findUnique({
      where: { cakto_order_id: orderId },
    });
    if (!existing) {
      await prisma.payment.create({
        data: {
          subscription_id: sub.id,
          business_id: sub.business_id,
          cakto_order_id: orderId,
          cakto_ref_id: extractId(data.refId) || undefined,
          cakto_event: "pix_gerado",
          method: "PIX",
          status: "PENDING",
          value: value || Number(sub.plan_price ?? 0),
          external_reference: sub.business_id,
        },
      });
    }
  }

  await writeAudit({
    actor: "cakto-webhook",
    businessId: sub.business_id,
    action: "payment.pix_generated",
    entity: "Payment",
    entityId: orderId ?? sub.id,
    metadata: { cakto_order_id: orderId, status: "PENDING" },
  });
  return true;
}

/**
 * purchase_approved — confirmação real do pagamento: ativa empresa+assinatura
 * e marca o pagamento RECEIVED.
 */
export async function processPurchaseApproved(
  data: CaktoEventData,
): Promise<boolean> {
  const resolved = await resolveSubscription(data);
  if (!resolved) {
    logger.warn("purchase_approved sem assinatura local", {
      sck: data.sck,
      email: data.customer?.email,
    });
    return false;
  }
  const sub = resolved.subscription!;
  const orderId = extractId(data.id);
  const caktoSubId = extractId(data.subscription);
  const value = valueFromData(data);
  const ts = new Date();
  const periodEnd = new Date(ts.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const existing = orderId
      ? await tx.payment.findUnique({ where: { cakto_order_id: orderId } })
      : null;

    if (existing) {
      await tx.payment.update({
        where: { id: existing.id },
        data: { status: "RECEIVED", paid_at: ts },
      });
    } else {
      await tx.payment.create({
        data: {
          subscription_id: sub.id,
          business_id: sub.business_id,
          cakto_order_id: orderId || undefined,
          cakto_ref_id: extractId(data.refId) || undefined,
          cakto_event: "purchase_approved",
          method: "PIX",
          status: "RECEIVED",
          value: value || Number(sub.plan_price ?? 0),
          paid_at: ts,
          external_reference: sub.business_id,
        },
      });
    }

    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        current_period_start: ts,
        current_period_end: periodEnd,
        ...(caktoSubId ? { cakto_subscription_id: caktoSubId } : {}),
      },
    });

    await tx.business.update({
      where: { id: sub.business_id },
      data: { status: "ACTIVE" },
    });
  });

  await writeAudit({
    actor: "cakto-webhook",
    businessId: sub.business_id,
    action: "payment.confirmed",
    entity: "Payment",
    entityId: orderId ?? sub.id,
    metadata: { cakto_order_id: orderId, status: "RECEIVED", via: "purchase_approved" },
  });
  logger.info("Pagamento Cakto confirmado — empresa ativada", {
    businessId: sub.business_id,
    orderId,
  });
  return true;
}

/** purchase_refused — marca o pagamento pendente como atrasado. */
export async function processPurchaseRefused(
  data: CaktoEventData,
): Promise<boolean> {
  const resolved = await resolveSubscription(data);
  if (!resolved) return false;
  const sub = resolved.subscription!;
  const orderId = extractId(data.id);

  if (orderId) {
    const existing = await prisma.payment.findUnique({
      where: { cakto_order_id: orderId },
    });
    if (existing) {
      await prisma.payment.update({
        where: { id: existing.id },
        data: { status: "OVERDUE" },
      });
    }
  }

  await writeAudit({
    actor: "cakto-webhook",
    businessId: sub.business_id,
    action: "payment.failed",
    entity: "Payment",
    entityId: orderId ?? sub.id,
    metadata: { cakto_order_id: orderId, status: "OVERDUE", via: "purchase_refused" },
  });
  return true;
}

/** refund / chargeback — marca o pagamento como reembolsado. */
export async function processRefund(data: CaktoEventData): Promise<boolean> {
  const resolved = await resolveSubscription(data);
  if (!resolved) return false;
  const sub = resolved.subscription!;
  const orderId = extractId(data.id);

  if (orderId) {
    const existing = await prisma.payment.findUnique({
      where: { cakto_order_id: orderId },
    });
    if (existing) {
      await prisma.payment.update({
        where: { id: existing.id },
        data: { status: "REFUNDED" },
      });
    }
  }

  await writeAudit({
    actor: "cakto-webhook",
    businessId: sub.business_id,
    action: "payment.refunded",
    entity: "Payment",
    entityId: orderId ?? sub.id,
    metadata: { cakto_order_id: orderId, status: "REFUNDED" },
  });
  return true;
}

/** subscription_created — vincula o id da assinatura Cakto. */
export async function processSubscriptionCreated(
  data: CaktoEventData,
): Promise<boolean> {
  const caktoSubId = extractId(data.subscription);
  if (!caktoSubId) return false;
  const resolved = await resolveSubscription(data);
  if (!resolved) return false;
  const sub = resolved.subscription!;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { cakto_subscription_id: caktoSubId },
  });

  await writeAudit({
    actor: "cakto-webhook",
    businessId: sub.business_id,
    action: "subscription.created",
    entity: "Subscription",
    entityId: sub.id,
    metadata: { cakto_subscription_id: caktoSubId },
  });
  return true;
}

/** subscription_renewed — renovação paga: novo período + Payment RECEIVED. */
export async function processSubscriptionRenewed(
  data: CaktoEventData,
): Promise<boolean> {
  const caktoSubId = extractId(data.subscription);
  const orderId = extractId(data.id);
  const resolved = await resolveSubscription(data);
  if (!resolved) return false;
  const sub = resolved.subscription!;
  const ts = new Date();
  const periodEnd = new Date(ts.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        current_period_start: ts,
        current_period_end: periodEnd,
        ...(caktoSubId ? { cakto_subscription_id: caktoSubId } : {}),
      },
    });

    // Renovação pode reusar data.id (ciclos/retentativas): atualiza em vez de
    // quebrar a UNIQUE cakto_order_id.
    const existing = orderId
      ? await tx.payment.findUnique({ where: { cakto_order_id: orderId } })
      : null;
    if (existing) {
      await tx.payment.update({
        where: { id: existing.id },
        data: {
          status: "RECEIVED",
          paid_at: ts,
          ...(existing.cakto_event !== "subscription_renewed"
            ? { cakto_event: "subscription_renewed" }
            : {}),
        },
      });
    } else {
      await tx.payment.create({
        data: {
          subscription_id: sub.id,
          business_id: sub.business_id,
          cakto_order_id: orderId || undefined,
          cakto_ref_id: extractId(data.refId) || undefined,
          cakto_event: "subscription_renewed",
          method: "PIX",
          status: "RECEIVED",
          value: valueFromData(data) || Number(sub.plan_price ?? 0),
          paid_at: ts,
          external_reference: sub.business_id,
        },
      });
    }

    await tx.business.update({
      where: { id: sub.business_id },
      data: { status: "ACTIVE" },
    });
  });

  await writeAudit({
    actor: "cakto-webhook",
    businessId: sub.business_id,
    action: "subscription.renewed",
    entity: "Subscription",
    entityId: sub.id,
    metadata: { cakto_subscription_id: caktoSubId, status: "RECEIVED" },
  });
  return true;
}

/** subscription_canceled — assinatura cancelada, empresa volta a PENDING_PAYMENT. */
export async function processSubscriptionCanceled(
  data: CaktoEventData,
): Promise<boolean> {
  const caktoSubId = extractId(data.subscription);
  const resolved = await resolveSubscription(data);
  if (!resolved) return false;
  const sub = resolved.subscription!;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "CANCELLED", cancelled_at: new Date() },
  });
  await prisma.business.updateMany({
    where: { id: sub.business_id },
    data: { status: "PENDING_PAYMENT" },
  });

  await writeAudit({
    actor: "cakto-webhook",
    businessId: sub.business_id,
    action: "subscription.cancelled_by_gateway",
    entity: "Subscription",
    entityId: sub.id,
    metadata: { cakto_subscription_id: caktoSubId },
  });
  return true;
}

/** subscription_renewal_refused — renovação recusada: NÃO ativa, marca atrasado. */
export async function processSubscriptionRenewalRefused(
  data: CaktoEventData,
): Promise<boolean> {
  const caktoSubId = extractId(data.subscription);
  const resolved = await resolveSubscription(data);
  if (!resolved) return false;
  const sub = resolved.subscription!;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "PAST_DUE" },
  });

  await writeAudit({
    actor: "cakto-webhook",
    businessId: sub.business_id,
    action: "subscription.renewal_refused",
    entity: "Subscription",
    entityId: sub.id,
    metadata: { cakto_subscription_id: caktoSubId, status: "PAST_DUE" },
  });
  return true;
}

/** Dispatcher de eventos Cakto (retorna false se o tipo não é tratado). */
export async function handleCaktoWebhookEvent(
  eventType: string,
  data: CaktoEventData,
): Promise<boolean> {
  switch (eventType) {
    case "pix_gerado":
      return processPixGerado(data);
    case "purchase_approved":
      return processPurchaseApproved(data);
    case "purchase_refused":
      return processPurchaseRefused(data);
    case "refund":
    case "chargeback":
      return processRefund(data);
    case "subscription_created":
      return processSubscriptionCreated(data);
    case "subscription_renewed":
      return processSubscriptionRenewed(data);
    case "subscription_canceled":
      return processSubscriptionCanceled(data);
    case "subscription_renewal_refused":
      return processSubscriptionRenewalRefused(data);
    default:
      return false;
  }
}

/** Eventos que queremos processar (custom_ids do Cakto). */
export const CAKTO_WEBHOOK_EVENTS = [
  "pix_gerado",
  "purchase_approved",
  "purchase_refused",
  "refund",
  "chargeback",
  "subscription_created",
  "subscription_renewed",
  "subscription_canceled",
  "subscription_renewal_refused",
] as const;
