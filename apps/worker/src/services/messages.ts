import { prisma, Prisma } from "@prospector/database";
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from "@prospector/types";
import { createLogger } from "@prospector/logger";
import { redis } from "./redis";

const logger = createLogger("worker.messages");

/** Prefixo do external_id das respostas da IA, derivado do message_id recebido. */
export const AI_REPLY_PREFIX = "reply:";

/** Constrói o external_id determinístico de uma resposta IA para a mensagem recebida. */
export function buildAiReplyExternalId(incomingExternalId: string): string {
  return `${AI_REPLY_PREFIX}${incomingExternalId}`;
}

/** Erro de unicidade (P2002) — usado para tratar reprocessamento como idempotente. */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// ---------------------------------------------------------------------------
// Idempotência do turno de IA: marcador "já respondemos a este message_id".
// Barreira adicional (Redis) além da constraint de unicidade no banco.
// ---------------------------------------------------------------------------

const AI_DONE_KEY = (businessId: string, externalId: string): string =>
  `msg:ai-done:${businessId}:${externalId}`;
const AI_DONE_TTL_SECONDS = 60 * 60 * 24;

/** true se a IA já gerou resposta para este message_id recebido. */
export async function wasAiResponded(
  businessId: string,
  externalId?: string | null,
): Promise<boolean> {
  if (!externalId) return false;
  try {
    return (await redis.exists(AI_DONE_KEY(businessId, externalId))) === 1;
  } catch {
    return false;
  }
}

/** Marca que a IA já respondeu este message_id recebido (idempotência do turno). */
export async function markAiResponded(
  businessId: string,
  externalId?: string | null,
): Promise<void> {
  if (!externalId) return;
  try {
    await redis.set(
      AI_DONE_KEY(businessId, externalId),
      "1",
      "EX",
      AI_DONE_TTL_SECONDS,
    );
  } catch {
    /* noop */
  }
}

export interface CreateMessageInput {
  leadId: string;
  businessId: string;
  campaignId?: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  content: string;
  status?: MessageStatus;
  provider?: string | null;
  externalId?: string | null;
}

export async function createMessage(input: CreateMessageInput) {
  const message = await prisma.message.create({
    data: {
      lead_id: input.leadId,
      business_id: input.businessId,
      campaign_id: input.campaignId ?? null,
      channel: input.channel,
      direction: input.direction,
      content: input.content,
      status: input.status ?? "QUEUED",
      provider: input.provider ?? null,
      external_id: input.externalId ?? null,
    },
  });
  logger.debug("Mensagem registrada", {
    message_id: message.id,
    channel: message.channel,
    direction: message.direction,
  });
  return message;
}

/**
 * Cria (ou reutiliza) a mensagem de RESPOSTA da IA para uma mensagem recebida.
 * O external_id é determinístico (`reply:<message_id recebido>`), garantindo que
 * um mesmo message_id recebido gere no máximo UMA resposta salva no banco —
 * retries/reprocessamentos reutilizam a mensagem existente em vez de duplicar.
 */
export async function createOrGetAiReplyMessage(input: {
  leadId: string;
  businessId: string;
  campaignId?: string | null;
  channel: MessageChannel;
  content: string;
  incomingExternalId?: string | null;
}) {
  const { incomingExternalId, ...rest } = input;
  if (incomingExternalId) {
    const replyExternalId = buildAiReplyExternalId(incomingExternalId);
    const existing = await prisma.message.findFirst({
      where: {
        business_id: input.businessId,
        external_id: replyExternalId,
        direction: "OUT",
      },
      select: { id: true, status: true },
    });
    if (existing) {
      logger.warn(
        "Resposta IA já existente para a mensagem recebida; reutilizando",
        {
          message_id: existing.id,
          incoming_external_id: incomingExternalId,
          business_id: input.businessId,
          status: existing.status,
        },
      );
      return { message: existing, created: false };
    }
    const message = await createMessage({
      ...rest,
      direction: "OUT",
      status: "QUEUED",
      provider: "ai",
      externalId: replyExternalId,
    });
    return { message, created: true };
  }
  const message = await createMessage({
    ...rest,
    direction: "OUT",
    status: "QUEUED",
    provider: "ai",
  });
  return { message, created: true };
}

export async function updateMessageStatus(
  messageId: string,
  status: MessageStatus,
  externalId?: string | null,
): Promise<void> {
  await prisma.message.update({
    where: { id: messageId },
    data: {
      status,
      ...(externalId !== undefined ? { external_id: externalId } : {}),
    },
  });
}

export async function markMessageFailed(
  messageId: string,
  reason: string,
): Promise<void> {
  await prisma.message.update({
    where: { id: messageId },
    data: { status: "FAILED" },
  });
  logger.warn("Mensagem marcada como falha", { message_id: messageId, reason });
}
