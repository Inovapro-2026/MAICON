import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { QUEUE_NAMES } from "@prospector/queues";
import { detectOptOut } from "@prospector/ai";
import { getWhatsAppManager } from "@prospector/whatsapp";
import { getWorkerQueue } from "../queues";
import { redis } from "../services/redis";
import { publishRealtime } from "../services/realtime";
import { createMessage, isUniqueConstraintError } from "../services/messages";
import {
  ensureConversation,
  touchConversation,
} from "../services/conversations";
import {
  isOptedOut,
  registerOptOut,
  resolveOrCreateLeadByPhone,
  resolveOrCreateLeadByEmail,
} from "../services/leads";

const logger = createLogger("worker.message-received");

interface MessageReceivedData {
  leadId?: string;
  conversationId?: string;
  campaignId?: string;
  businessId?: string;
  channel: "WHATSAPP" | "EMAIL";
  content: string;
  from: string;
  remoteJid?: string;
  externalId?: string;
}

export async function processMessageReceived(job: {
  id?: string;
  data: MessageReceivedData;
}): Promise<void> {
  const { channel, content, from, businessId } = job.data;

  // 0) IDEMPOTÊNCIA (dupla barreira):
  //    a) Lock atômico no Redis (SETNX) — protege contra jobs concorrentes.
  //    b) Verificação no banco (external_id) — protege contra reprocessamento futuro.
  if (job.data.externalId) {
    const lockKey = `msg:in:${businessId ?? "default"}:${job.data.externalId}`;
    const acquired = await redis.set(lockKey, "1", "EX", 300, "NX");
    if (!acquired) {
      logger.info("Mensagem duplicada ignorada (lock Redis)", {
        external_id: job.data.externalId,
        business_id: businessId,
        from,
      });
      return;
    }
    const duplicate = await prisma.message.findFirst({
      where: {
        external_id: job.data.externalId,
        direction: "IN",
        channel,
        ...(businessId ? { business_id: businessId } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      logger.info("Mensagem duplicada ignorada (banco)", {
        external_id: job.data.externalId,
        business_id: businessId,
        from,
        existing_message_id: duplicate.id,
      });
      return;
    }
  }

  // 1) Resolve o lead (cria automaticamente se o número/e-mail for desconhecido)
  let leadId = job.data.leadId;
  let lead: {
    id: string;
    phone: string | null;
    email: string | null;
    status: string;
  } | null = null;
  if (!leadId) {
    if (channel === "WHATSAPP") {
      // Se o remetente vier como LID (@lid), resolve para o número real para
      // cadastrar/responder pelo telefone (envio via LID não entrega).
      let digits = from;
      if (job.data.remoteJid?.includes("@lid")) {
        const resolved = await getWhatsAppManager(
          businessId,
        ).resolvePhoneFromLid(job.data.remoteJid);
        if (resolved) {
          digits = resolved;
          logger.debug("LID resolvido para telefone", {
            lid: from,
            phone: resolved,
          });
        }
      }
      lead = await resolveOrCreateLeadByPhone(digits, businessId ?? "default");
    } else {
      lead = await resolveOrCreateLeadByEmail(from, businessId ?? "default");
    }
    leadId = lead.id;
  }

  const fullLead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!fullLead) return;

  // 2) Registra a mensagem recebida (idempotente).
  //    A constraint de unicidade (business_id, external_id) garante que o mesmo
  //    message_id do WhatsApp seja salvo no máximo UMA vez — se dois jobs
  //    concorrentes passarem a barreira anterior, o segundo recebe P2002.
  let message;
  try {
    message = await createMessage({
      leadId,
      businessId: businessId ?? fullLead.business_id,
      campaignId: job.data.campaignId,
      channel,
      direction: "IN",
      content,
      status: "DELIVERED",
      provider: channel === "WHATSAPP" ? "whatsapp" : "resend",
      externalId: job.data.externalId,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      logger.info("Mensagem recebida já processada (constraint de unicidade)", {
        external_id: job.data.externalId,
        business_id: businessId ?? fullLead.business_id,
        from,
      });
      return;
    }
    throw error;
  }

  // 3) Conversa
  const conversationId = await ensureConversation(
    leadId,
    businessId ?? fullLead.business_id,
  );
  await touchConversation(conversationId, businessId);

  // 4) Atualiza status do funil
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "RESPONDED" },
  });
  await prisma.campaignLead.updateMany({
    where: {
      lead_id: leadId,
      ...(businessId ? { business_id: businessId } : {}),
    },
    data: { status: "RESPONDED" },
  });

  // 4b) Cria notificação multi-tenant da resposta recebida (idempotente via message_id único)
  const contactName = fullLead.name?.trim() || fullLead.phone || "Contato";
  const businessName = fullLead.business_name?.trim();
  const contactDisplay = businessName && businessName !== contactName
    ? `${contactName} — ${businessName}`
    : contactName;

  const notifTitle = "Nova resposta de WhatsApp";
  const notifDesc = `${contactDisplay} respondeu sua mensagem.`;
  const notifPreview = content.length > 120 ? `${content.slice(0, 117)}...` : content;

  let notificationRecord = null;
  try {
    notificationRecord = await prisma.notification.create({
      data: {
        business_id: businessId ?? fullLead.business_id,
        type: "WHATSAPP_RESPONSE",
        title: notifTitle,
        description: notifDesc,
        preview: notifPreview,
        lead_id: leadId,
        conversation_id: conversationId,
        message_id: message.id,
        read: false,
      },
    });
  } catch (notifErr) {
    logger.debug("Notificação já existente ou ignorada", { message_id: message.id, error: String(notifErr) });
  }

  // 4c) Emite eventos em tempo real (novo lead respondeu + notificação + mudança de status)
  const nowIso = new Date().toISOString();
  publishRealtime({
    type: "new_message_received",
    conversationId,
    leadId,
    businessId: businessId ?? fullLead.business_id,
    timestamp: nowIso,
    payload: {
      content,
      direction: "IN",
      lead_status: "RESPONDED",
      notification: notificationRecord ? {
        id: notificationRecord.id,
        title: notificationRecord.title,
        description: notificationRecord.description,
        preview: notificationRecord.preview,
        conversation_id: conversationId,
        created_at: notificationRecord.created_at.toISOString(),
      } : undefined,
    },
  });
  publishRealtime({
    type: "status_changed",
    conversationId,
    leadId,
    businessId: businessId ?? fullLead.business_id,
    timestamp: nowIso,
    payload: { lead_status: "RESPONDED" },
  });


  logger.info("Mensagem recebida processada", {
    lead_id: leadId,
    conversation_id: conversationId,
    channel,
    message_id: message.id,
    from,
  });

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) return;

  // 5) Modo manual: humano está atendendo, IA não entra
  if (conversation.human_handled) {
    logger.info("Conversa em modo manual; IA não acionada", {
      conversation_id: conversationId,
    });
    return;
  }

  // 6) Opt-out já registrado: não incomodar novamente
  if (await isOptedOut(leadId, businessId ?? fullLead.business_id)) {
    logger.info("Lead já opt-out; IA não acionada", { lead_id: leadId });
    return;
  }

  // 7) Detecção rápida de opt-out
  if (detectOptOut(content)) {
    await registerOptOut(
      leadId,
      channel,
      `Palavra-chave detectada: "${content.slice(0, 80)}"`,
      businessId ?? fullLead.business_id,
    );
    logger.info("Opt-out registrado na recepção", { lead_id: leadId });
    return;
  }

  // 8) Aciona o agente de IA.
  //    JobId determinístico a partir do message_id recebido: se o mesmo
  //    externalId for enfileirado de novo (retry/re-delivery), o BullMQ
  //    descarta a duplicata — nunca gera duas respostas para a mesma mensagem.
  const aiJobId = job.data.externalId
    ? `ai-${businessId ?? "default"}-${job.data.externalId}`
    : `ai-${businessId ?? "default"}-${leadId}-${Date.now()}`;
  await getWorkerQueue(QUEUE_NAMES.AI_RESPONSE).add(
    "respond",
    {
      conversationId,
      leadId,
      campaignId: job.data.campaignId,
      businessId: businessId ?? fullLead.business_id,
      content,
      remoteJid: job.data.remoteJid,
      externalId: job.data.externalId,
    },
    {
      jobId: aiJobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    },
  );
}
