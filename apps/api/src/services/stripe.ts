/**
 * Integração Stripe (gateway de pagamento do SAVYRON).
 *
 * Runtime da aplicação: usa o SDK oficial `stripe-node`.
 * Setup administrativo (produtos, preços, webhook endpoint) é feito via MCP.
 *
 * Regras críticas:
 * - NUNCA duplicar customer: checar stripe_customer_id antes de criar.
 * - NUNCA ativar Business/Subscription sem confirmação real do gateway
 *   (invoice.payment_succeeded ou checkout.session.completed com paid).
 * - Chaves nunca expostas no frontend; apenas a publishable key.
 */
import { config } from "@prospector/config";
import { createLogger } from "@prospector/logger";
import Stripe from "stripe";

const logger = createLogger("api.stripe");

// Cache do cliente Stripe (singleton por processo).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente)");
  }
  if (!_stripe) {
    _stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: "2026-07-29.dahlia",
    });
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(config.stripe.secretKey?.trim());
}

export function getPublishableKey(): string | null {
  return config.stripe.publishableKey?.trim() || null;
}

export function getPaymentMethodConfigurationId(): string | null {
  return config.stripe.paymentMethodConfigurationId?.trim() || null;
}

/** Tipo do evento Stripe (escolha restrita do webhook). */
export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.payment_succeeded"
  | "invoice.payment_failed";

export const STRIPE_WEBHOOK_EVENTS: StripeWebhookEventType[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

/** Valida assinatura do webhook com o secret configurado. */
export function constructStripeEvent(
  payload: Buffer | string,
  signature: string,
): Stripe.Event {
  const webhookSecret = config.stripe.webhookSecret?.trim();
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET não configurado");
  return getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
}

export interface StripeCustomerInput {
  name: string;
  email: string;
  metadata?: Record<string, string>;
}

/** Cria (ou reutiliza) o customer Stripe da empresa. Retorna o id. */
export async function createStripeCustomer(
  input: StripeCustomerInput,
): Promise<string> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: input.name?.slice(0, 200) || undefined,
    email: input.email || undefined,
    metadata: input.metadata,
  });
  return customer.id;
}

/**
 * Cria uma Checkout Session `mode: subscription` vinculada ao customer.
 * Usa a Payment Method Configuration que habilita PIX + cartão.
 * `client_reference_id` carrega o businessId para reconciliação segura.
 */
export async function createCheckoutSession(input: {
  customerId: string;
  priceId: string;
  businessId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const pmc = getPaymentMethodConfigurationId();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.businessId,
    metadata: {
      business_id: input.businessId,
      ...input.metadata,
    },
    // Usa a Payment Method Configuration quando existir; caso contrário deixa
    // os métodos dinâmicos (os habilitados no dashboard: cartão sempre, PIX
    // quando ativado para BRL).
    ...(pmc ? { payment_method_configuration: pmc } : {}),
    subscription_data: { metadata: { business_id: input.businessId } },
    allow_promotion_codes: false,
  });
  return session;
}

/** Busca uma Checkout Session expandida (para checkout.session.completed). */
export async function retrieveCheckoutSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "customer", "line_items"],
  });
}

/** Busca uma assinatura Stripe. */
export async function retrieveSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.retrieve(subscriptionId);
}

/** Cancela uma assinatura Stripe. */
export async function cancelStripeSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.cancel(subscriptionId);
}

/** Atualiza o item (preço) de uma assinatura — usado na troca de plano. */
export async function updateSubscriptionPrice(
  subscriptionId: string,
  priceId: string,
): Promise<Stripe.Subscription> {
  const subscription = await getStripe().subscriptions.retrieve(
    subscriptionId,
    { expand: ["items.data.price"] },
  );
  const itemId = subscription.items?.data?.[0]?.id;
  if (!itemId) throw new Error("Assinatura sem items");
  return getStripe().subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: "create_prorations",
  });
}

/** Mapeia status da assinatura Stripe para o enum local. */
export function mapStripeSubscriptionStatus(
  status: string,
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" | "SUSPENDED" {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELLED";
    case "incomplete":
    case "incomplete_expired":
      return "EXPIRED";
    case "paused":
      return "SUSPENDED";
    default:
      return "ACTIVE";
  }
}

/** Extrai o business_id de um evento Stripe (metadata/client_reference_id). */
export function businessIdFromEvent(event: Stripe.Event): string | null {
  const obj = (event.data?.object ?? {}) as unknown as Record<string, unknown>;
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  if (typeof metadata.business_id === "string") return metadata.business_id;
  const crf = obj.client_reference_id;
  if (typeof crf === "string") return crf;
  return null;
}
