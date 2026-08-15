import { Router, Request, Response } from "express";
import { createLogger } from "@prospector/logger";
import { QUEUE_NAMES } from "@prospector/queues";
import { asyncHandler, ok } from "../lib/http";
import { getQueue } from "../services/queues";
import { parseResendWebhook } from "@prospector/email";
import { prisma } from "@prospector/database";
import { constructStripeEvent, isStripeConfigured } from "../services/stripe";
import { handleStripeWebhookEvent } from "../services/stripe-billing";
import {
  isCaktoWebhookSecretValid,
  isCaktoWebhookConfigured,
} from "../services/cakto";
import { handleCaktoWebhookEvent } from "../services/cakto-billing";

const logger = createLogger("api.webhooks");

export const webhooksRouter = Router();

// ---------------------------------------------------------------------------
// Webhook Stripe — valida assinatura (constructEvent), deduplica por event.id,
// processa os eventos restritos de billing. Só ativa conta com confirmação real.
// ---------------------------------------------------------------------------

let stripeEventCache = new Map<string, number>();
const STRIPE_EVENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function isStripeEventProcessed(eventId: string): Promise<boolean> {
  const cached = stripeEventCache.get(eventId);
  if (cached && Date.now() - cached < STRIPE_EVENT_CACHE_TTL_MS) return true;
  const found = await prisma.auditLog.findFirst({
    where: {
      entity: "StripeWebhookEvent",
      entity_id: eventId,
      action: "stripe.event_processed",
    },
  });
  return Boolean(found);
}

async function markStripeEventProcessed(eventId: string): Promise<void> {
  stripeEventCache.set(eventId, Date.now());
  await prisma.auditLog
    .create({
      data: {
        actor: "stripe-webhook",
        action: "stripe.event_processed",
        entity: "StripeWebhookEvent",
        entity_id: eventId,
      },
    })
    .catch(() => {});
}

/**
 * POST /webhooks/stripe — recebe eventos do Stripe (modo instantâneo/snapshot).
 * A rota pública do nginx /api/webhooks/stripe aponta para cá (4005/webhooks/stripe).
 */
webhooksRouter.post(
  "/stripe",
  asyncHandler(async (req: Request, res: Response) => {
    if (!isStripeConfigured()) {
      return res.status(503).json({
        success: false,
        error: { code: "NOT_CONFIGURED", message: "Stripe não configurado" },
      });
    }

    const signature = String(req.headers["stripe-signature"] ?? "");
    if (!signature) {
      logger.warn("Webhook Stripe sem assinatura", { ip: req.ip });
      return res.status(400).json({
        success: false,
        error: { code: "BAD_REQUEST", message: "Assinatura ausente" },
      });
    }

    let event: import("stripe").Event;
    try {
      // Usa o body BRUTO (Buffer) para validar a assinatura — o req.body já
      // parseado pelo express.json() altera a serialização e quebra o HMAC.
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      event = constructStripeEvent(
        rawBody ?? Buffer.from(JSON.stringify(req.body)),
        signature,
      );
    } catch (error) {
      logger.warn("Webhook Stripe com assinatura inválida", {
        ip: req.ip,
        error,
      });
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_SIGNATURE", message: "Assinatura inválida" },
      });
    }

    const eventId = event.id;
    if (await isStripeEventProcessed(eventId)) {
      return ok(res, { received: true, duplicate: true });
    }

    // Persiste o evento ANTES do processamento (garante deduplicação mesmo se falhar).
    await prisma.auditLog
      .create({
        data: {
          actor: "stripe-webhook",
          action: "stripe.event_received",
          entity: "StripeWebhookEvent",
          entity_id: eventId,
          metadata: {
            event: event.type,
            stripe_customer_id:
              (event.data.object as unknown as Record<string, unknown>)
                ?.customer ?? null,
            stripe_subscription_id:
              (event.data.object as unknown as Record<string, unknown>)
                ?.subscription ?? null,
          },
        },
      })
      .catch(() => {});

    res.json({ success: true, data: { received: true } });

    // Processamento assíncrono (200 imediato).
    void (async () => {
      try {
        const handled = await handleStripeWebhookEvent(
          event.type,
          (event.data?.object ?? {}) as unknown as Record<string, unknown>,
        );
        if (!handled) {
          logger.info("Evento Stripe não tratado", { event: event.type });
        }
        await markStripeEventProcessed(eventId);
      } catch (error) {
        logger.error("Falha ao processar evento Stripe", {
          eventId,
          event: event.type,
          error,
        });
      }
    })();
  }),
);

// ---------------------------------------------------------------------------
// Webhook Cakto — valida o `secret` no corpo, deduplica por (event, data.id),
// processa os eventos de billing. Só ativa conta com confirmação real
// (purchase_approved / subscription_renewed).
// ---------------------------------------------------------------------------

let caktoEventCache = new Map<string, number>();
const CAKTO_EVENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function caktoDedupKey(event: string, dataId: string): string {
  return `${event}:${dataId}`;
}

async function isCaktoEventProcessed(key: string): Promise<boolean> {
  const cached = caktoEventCache.get(key);
  if (cached && Date.now() - cached < CAKTO_EVENT_CACHE_TTL_MS) return true;
  const found = await prisma.auditLog.findFirst({
    where: {
      entity: "CaktoWebhookEvent",
      entity_id: key,
      action: "cakto.event_processed",
    },
  });
  return Boolean(found);
}

async function markCaktoEventProcessed(key: string): Promise<void> {
  caktoEventCache.set(key, Date.now());
  await prisma.auditLog
    .create({
      data: {
        actor: "cakto-webhook",
        action: "cakto.event_processed",
        entity: "CaktoWebhookEvent",
        entity_id: key,
      },
    })
    .catch(() => {});
}

/**
 * POST /webhooks/cakto — recebe eventos do Cakto (PIX recorrente).
 * A rota pública do nginx /api/webhooks/cakto aponta para cá (4005/webhooks/cakto).
 */
webhooksRouter.post(
  "/cakto",
  asyncHandler(async (req: Request, res: Response) => {
    if (!isCaktoWebhookConfigured()) {
      return res.status(503).json({
        success: false,
        error: { code: "NOT_CONFIGURED", message: "Cakto não configurado" },
      });
    }

    const body = req.body ?? {};
    const event = String(body.event ?? "");
    const data = body.data ?? {};
    const dataId = typeof data?.id === "string" ? data.id : "";

    // Validação de origem: Cakto NÃO assina o payload; o `secret` vem no corpo.
    if (!isCaktoWebhookSecretValid(body.secret)) {
      logger.warn("Webhook Cakto com secret inválido", { ip: req.ip });
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "unauthorized" },
      });
    }

    // Deduplicação por (event, data.id) — NÃO por data.id sozinho: o mesmo
    // pedido dispara pix_gerado e purchase_approved com o MESMO data.id.
    const dedupKey = caktoDedupKey(event, dataId);
    if (await isCaktoEventProcessed(dedupKey)) {
      return ok(res, { received: true, duplicate: true });
    }

    // Persiste o recebimento ANTES do processamento (deduplicação segura).
    await prisma.auditLog
      .create({
        data: {
          actor: "cakto-webhook",
          action: "cakto.event_received",
          entity: "CaktoWebhookEvent",
          entity_id: dedupKey,
          metadata: {
            event,
            cakto_order_id: dataId || null,
            sck: data.sck ?? null,
            email: data.customer?.email ?? null,
          },
        },
      })
      .catch(() => {});

    res.json({ success: true, data: { received: true } });

    // Processamento assíncrono (200 imediato; Cakto espera resposta em 8s).
    void (async () => {
      try {
        const handled = await handleCaktoWebhookEvent(event, data);
        if (!handled) {
          logger.info("Evento Cakto não tratado", { event, dataId });
        }
        await markCaktoEventProcessed(dedupKey);
      } catch (error) {
        logger.error("Falha ao processar evento Cakto", {
          event,
          dataId,
          error,
        });
      }
    })();
  }),
);

/** POST /webhooks/resend — eventos de entrega/abertura/clique/etc. */
webhooksRouter.post(
  "/resend",
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const parsed = parseResendWebhook(body);

    const raw = JSON.stringify(body).slice(0, 20000);

    const deliveryEvent = await prisma.deliveryEvent.create({
      data: {
        event: parsed.event,
        payload: parsed.payload as object,
      },
    });

    await getQueue(QUEUE_NAMES.WEBHOOK_PROCESSING).add(
      "process",
      {
        provider: "RESEND",
        event: parsed.event,
        payload: parsed.payload,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
    );

    logger.info("Webhook Resend recebido", {
      event: parsed.event,
      external_id: parsed.externalId ?? undefined,
      delivery_event_id: deliveryEvent.id,
    });

    return ok(res, { received: true });
  }),
);

/** POST /webhooks/whatsapp — (reservado) eventos do WhatsApp quando via webhook. */
webhooksRouter.post(
  "/whatsapp",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Webhook WhatsApp recebido", {
      body_keys: Object.keys(req.body ?? {}),
    });
    return ok(res, { received: true });
  }),
);
