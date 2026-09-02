import { createLogger } from "@prospector/logger";
import { config } from "@prospector/config";
import { prisma, Prisma } from "@prospector/database";
import { getDashboardMetrics } from "./dashboard-service";
import { getCampaignStats } from "./campaign-service";
import { redisClient, NEXT_SEND_KEY } from "./redis";
import { resolveApiKey, markApiKeyExhausted } from "./api-keys";

const logger = createLogger("api.agent");

const GROQ_BASE = "https://api.groq.com/openai/v1";
const agentModel = config.ai.agentModel;

// --- Pending actions store (confirmation flow) ---
interface PendingAction {
  action: "pause" | "start" | "resume";
  campaignId: string;
  campaignName: string;
  createdAt: number;
}

const pendingActions = new Map<string, PendingAction>();
const PENDING_TTL_MS = 120_000;

function pendingKey(businessId: string, userId: string): string {
  return `${businessId}:${userId}`;
}

function getPendingAction(
  businessId: string,
  userId: string,
): PendingAction | null {
  const key = pendingKey(businessId, userId);
  const entry = pendingActions.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
    pendingActions.delete(key);
    return null;
  }
  return entry;
}

function setPendingAction(
  businessId: string,
  userId: string,
  action: PendingAction,
): void {
  const key = pendingKey(businessId, userId);
  pendingActions.set(key, action);
}

function clearPendingAction(businessId: string, userId: string): void {
  pendingActions.delete(pendingKey(businessId, userId));
}

// --- Detecção de erro de quota (para rotação/fallback) ---
function isQuotaError(status: number, body: string): boolean {
  if (status === 401 || status === 429) return true;
  return /quota|credit|limit|remaining|character|insufficient/i.test(body);
}

/**
 * Executa `fn(key)` com rotação automática de chaves do provedor:
 * se a chave ativa falhar por quota, marca como esgotada e tenta a próxima.
 * Retorna { ok, value?, error?, quotaExhausted }.
 */
async function callWithKeyRotation<T>(
  provider: "groq" | "elevenlabs",
  fn: (key: string) => Promise<{ status: number; body: string; value: T }>,
  maxAttempts = 5,
): Promise<{
  ok: boolean;
  value?: T;
  error?: { status: number; body: string };
}> {
  let lastError: { status: number; body: string } | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = await resolveApiKey(provider);
    if (!key) {
      if (attempt > 0) break;
      return {
        ok: false,
        error: { status: 0, body: "Nenhuma chave configurada" },
      };
    }
    try {
      const result = await fn(key);
      if (result.status < 200 || result.status >= 300) {
        lastError = { status: result.status, body: result.body };
        if (isQuotaError(result.status, result.body)) {
          await markApiKeyExhausted(provider, key, result.body.slice(0, 300));
          logger.warn("Chave esgotada na rotação do agente; tentando próxima", {
            provider,
            attempt: attempt + 1,
          });
          continue;
        }
        return { ok: false, error: lastError };
      }
      return { ok: true, value: result.value };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = { status: 0, body: message };
      // Erro de rede/timeout: não marca como esgotada, apenas falha.
      return { ok: false, error: lastError };
    }
  }
  return {
    ok: false,
    error: lastError ?? { status: 0, body: "Sem chaves disponíveis" },
  };
}

// --- STT via Groq Whisper ---
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const blob = new Blob([audioBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append(
    "file",
    blob,
    `audio.${mimeType.includes("webm") ? "webm" : "mp3"}`,
  );
  formData.append("model", "whisper-large-v3");
  formData.append("language", "pt");

  const { ok, value } = await callWithKeyRotation<string>(
    "groq",
    async (key) => {
      const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: formData,
      });
      const body = await res.text().catch(() => "");
      const transcript = (() => {
        try {
          return (JSON.parse(body) as { text?: string }).text?.trim() ?? "";
        } catch {
          return "";
        }
      })();
      return { status: res.status, body, value: transcript };
    },
  );

  if (!ok) {
    logger.error("Falha no STT Groq", { error: value });
    return "";
  }
  return value ?? "";
}

// --- LLM function calling schema ---
const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_dashboard_stats",
      description:
        "Obtém estatísticas do dashboard da empresa: total de leads, pendentes, enviados hoje, respostas recebidas, interessados, erros",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_campaign_status",
      description:
        "Obtém o status da campanha da empresa: status (ativa/pausada), total de leads, pendentes, enviados, respostas, interessados, erros",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "pause_campaign",
      description:
        "Pausa a campanha ativa da empresa imediatamente. Requer confirmação do usuário antes de executar.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "start_campaign",
      description:
        "Inicia ou retoma a campanha da empresa. Se estiver pausada, retoma; se nova, inicia. Requer confirmação do usuário antes de executar.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_last_messages",
      description:
        'Obtém as últimas mensagens enviadas e/ou recebidas pela empresa, com conteúdo, contato, data/hora e canal. Use para responder sobre o conteúdo de mensagens, ex.: "qual foi a última mensagem?", "o que o cliente respondeu?", "quantas mensagens recebi hoje?".',
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["sent", "received", "both"],
            description:
              "Filtrar por sentido: sent (enviadas), received (recebidas) ou both (todas, padrão)",
          },
          limit: {
            type: "integer",
            description:
              "Quantidade máxima de mensagens a retornar (padrão 5, máximo 10)",
          },
          contactName: {
            type: "string",
            description:
              'Nome ou telefone do contato para filtrar a conversa (ex.: "Maicon")',
          },
        },
      },
    },
  },
];

const STATE_CHANGING_TOOLS = new Set(["pause_campaign", "start_campaign"]);

// --- Tool execution ---
async function executeTool(
  name: string,
  businessId: string,
  args: Record<string, unknown> = {},
): Promise<{ result: Record<string, unknown>; stateChanged: boolean }> {
  switch (name) {
    case "get_dashboard_stats": {
      const metrics = await getDashboardMetrics(businessId);
      return {
        result: metrics as unknown as Record<string, unknown>,
        stateChanged: false,
      };
    }
    case "get_campaign_status": {
      const campaign = await prisma.campaign.findFirst({
        where: { business_id: businessId },
        orderBy: { created_at: "desc" },
      });
      if (!campaign) {
        return {
          result: { exists: false, message: "Nenhuma campanha cadastrada" },
          stateChanged: false,
        };
      }
      const stats = await getCampaignStats(campaign.id, businessId);
      return {
        result: {
          exists: true,
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          total: stats.total,
          pending: stats.pending,
          sent: stats.sent,
          responded: stats.responded,
          interested: stats.interested,
          notInterested: stats.notInterested,
          optOut: stats.optOut,
          errors: stats.errors,
          progressPercent: stats.progressPercent,
        },
        stateChanged: false,
      };
    }
    case "pause_campaign": {
      const campaign = await prisma.campaign.findFirst({
        where: {
          business_id: businessId,
          status: { in: ["ACTIVE", "PAUSED"] },
        },
        select: { id: true, name: true, status: true },
      });
      if (!campaign)
        return {
          result: { error: "Nenhuma campanha ativa ou pausada encontrada" },
          stateChanged: false,
        };
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "PAUSED" },
      });
      logger.info("Agente: campanha pausada", {
        campaign_id: campaign.id,
        business_id: businessId,
      });
      return {
        result: {
          success: true,
          campaignName: campaign.name,
          status: "PAUSED",
          message: "Campanha pausada",
        },
        stateChanged: true,
      };
    }
    case "start_campaign": {
      const campaign = await prisma.campaign.findFirst({
        where: { business_id: businessId },
        orderBy: { created_at: "desc" },
        select: { id: true, name: true, status: true },
      });
      if (!campaign)
        return {
          result: { error: "Nenhuma campanha cadastrada" },
          stateChanged: false,
        };
      if (campaign.status === "FINISHED") {
        return {
          result: { error: "Campanha encerrada não pode ser reiniciada" },
          stateChanged: false,
        };
      }
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "ACTIVE" },
      });
      await redisClient.del(NEXT_SEND_KEY(campaign.id)).catch(() => undefined);
      const { schedulePump } = await import("../routes/campaigns");
      await schedulePump(campaign.id, businessId);
      logger.info("Agente: campanha iniciada/retomada", {
        campaign_id: campaign.id,
        business_id: businessId,
      });
      return {
        result: {
          success: true,
          campaignName: campaign.name,
          status: "ACTIVE",
          message: "Campanha iniciada",
        },
        stateChanged: true,
      };
    }
    case "get_last_messages": {
      const direction = String(args.direction ?? "both");
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
      const contactName = String(args.contactName ?? "").trim();

      const where: Prisma.MessageWhereInput = { business_id: businessId };
      if (direction === "sent") where.direction = "OUT";
      else if (direction === "received") where.direction = "IN";
      if (contactName) {
        where.lead = {
          business_id: businessId,
          OR: [
            { name: { contains: contactName, mode: "insensitive" } },
            { phone: { contains: contactName } },
          ],
        };
      }

      const messages = await prisma.message.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: limit,
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              business_name: true,
            },
          },
        },
      });

      return {
        result: {
          count: messages.length,
          messages: messages.map((m) => ({
            id: m.id,
            direction: m.direction,
            channel: m.channel,
            content: m.content,
            created_at: m.created_at,
            contact: {
              name: m.lead.name,
              phone: m.lead.phone,
              email: m.lead.email,
              business_name: m.lead.business_name,
            },
          })),
        },
        stateChanged: false,
      };
    }
    default:
      return {
        result: { error: `Ferramenta desconhecida: ${name}` },
        stateChanged: false,
      };
  }
}

interface GroqMessage {
  role: string;
  content?: string | null;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

// --- Groq chat with tools ---
async function groqChat(
  messages: GroqMessage[],
  options?: { toolChoice?: "auto" | "none" },
): Promise<{
  text: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}> {
  const body: Record<string, unknown> = {
    model: agentModel,
    messages,
    temperature: 1,
    max_tokens: 2048,
    top_p: 1,
    stream: false,
    tools: TOOLS,
    tool_choice: options?.toolChoice ?? "auto",
  };

  const { ok, value, error } = await callWithKeyRotation<{
    text: string;
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  }>("groq", async (key) => {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const resBody = await res.text().catch(() => "");
    if (res.status < 200 || res.status >= 300) {
      return {
        status: res.status,
        body: resBody,
        value: { text: "", toolCalls: [] },
      };
    }
    const data = (() => {
      try {
        return JSON.parse(resBody) as {
          choices?: Array<{
            message?: {
              content?: string | null;
              tool_calls?: Array<{
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>;
        };
      } catch {
        return {};
      }
    })();
    const message = data.choices?.[0]?.message;
    if (!message)
      return { status: 200, body: resBody, value: { text: "", toolCalls: [] } };
    const toolCalls = (message.tool_calls ?? [])
      .map((tc) => {
        try {
          return {
            name: tc.function?.name ?? "",
            args: JSON.parse(tc.function?.arguments ?? "{}") as Record<
              string,
              unknown
            >,
          };
        } catch {
          return { name: tc.function?.name ?? "", args: {} };
        }
      })
      .filter((tc) => tc.name);
    return {
      status: res.status,
      body: resBody,
      value: { text: message.content?.trim() ?? "", toolCalls },
    };
  });

  if (!ok) {
    throw new Error(`LLM API error: ${error?.body ?? "sem chaves"}`);
  }
  return value ?? { text: "", toolCalls: [] };
}

const SYSTEM_PROMPT = `Você é o assistente de voz do SAVYRON, uma plataforma de prospecção comercial. Você fala português brasileiro de forma natural e concisa.

Você tem acesso a ferramentas para consultar dados, controlar a campanha e consultar as mensagens da empresa. Responda de forma amigável e direta, sempre em português.

Regras:
1. Para CONSULTAS (estatísticas, status), SEMPRE chame a ferramenta (get_dashboard_stats ou get_campaign_status) e responda com os números reais que ela retornar — nunca invente dados.
2. Para AÇÕES que mudam estado (pausar ou iniciar/retomar campanha), SEMPRE chame a ferramenta correspondente (pause_campaign ou start_campaign). NUNCA responda só com texto perguntando sobre a ação: o sistema vai pedir a confirmação ao usuário automaticamente quando você chamar a ferramenta.
3. Para perguntas sobre MENSAGENS (ex.: "qual foi a última mensagem?", "o que o cliente respondeu?", "quantas mensagens recebi hoje?"), SEMPRE chame get_last_messages e responda RESUMINDO o conteúdo em linguagem natural e falada — cite o contato, o canal (WhatsApp/e-mail) e quando a mensagem chegou. Nunca despeje campos técnicos crus. Quando o usuário citar um contato específico, use o parâmetro contactName com o nome ou telefone.
4. Responda apenas em texto simples, sem formatação especial.`;

const CONFIRMATION_PROMPT = (action: string, campaignName: string) => {
  const label = action === "pause" ? "pausar" : "iniciar/retomar";
  return `Você quer que eu ${label} a campanha "${campaignName}" agora? Diga "sim" para confirmar.`;
};

// --- Main chat handler ---
export async function processChat(
  businessId: string,
  userId: string,
  transcript: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<{ text: string; pendingAction: boolean }> {
  const pendingAction = getPendingAction(businessId, userId);

  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-10),
    { role: "user", content: transcript },
  ];

  // If there's a pending action, tell the LLM it's a confirmation turn
  if (pendingAction) {
    const actionLabel =
      pendingAction.action === "pause" ? "pausar" : "iniciar/retomar";
    messages.push({
      role: "system",
      content: `ATENÇÃO: O usuário está respondendo à sua pergunta de confirmação sobre ${actionLabel} a campanha "${pendingAction.campaignName}". Se o usuário CONFIRMOU (disse sim, pode, confirma, ok, pode sim, positivo), chame a ferramenta novamente para executar a ação. Se o usuário RECUSOU (disse não, para, cancela, negativo), não chame ferramenta nenhuma e responda educadamente que a ação não foi executada.`,
    });
  }

  let response = await groqChat(messages);

  if (response.toolCalls.length > 0) {
    for (const toolCall of response.toolCalls) {
      const isStateChanging = STATE_CHANGING_TOOLS.has(toolCall.name);

      if (isStateChanging && !pendingAction) {
        // First request: get campaign info, set pending, ask for confirmation
        const campaign = await prisma.campaign.findFirst({
          where: { business_id: businessId },
          orderBy: { created_at: "desc" },
          select: { id: true, name: true },
        });
        if (!campaign) {
          return {
            text: "Não encontrei nenhuma campanha cadastrada na sua empresa.",
            pendingAction: false,
          };
        }
        const action = toolCall.name === "pause_campaign" ? "pause" : "start";
        setPendingAction(businessId, userId, {
          action,
          campaignId: campaign.id,
          campaignName: campaign.name,
          createdAt: Date.now(),
        });
        return {
          text: CONFIRMATION_PROMPT(action, campaign.name),
          pendingAction: true,
        };
      }

      if (isStateChanging && pendingAction) {
        // Confirmation received — execute
        const actionName =
          pendingAction.action === "pause"
            ? "pause_campaign"
            : "start_campaign";
        const { result, stateChanged } = await executeTool(
          actionName,
          businessId,
        );
        clearPendingAction(businessId, userId);

        if (result.error) {
          return { text: String(result.error), pendingAction: false };
        }

        // Format success message
        const campaignName = pendingAction.campaignName;
        if (pendingAction.action === "pause") {
          return {
            text: `Campanha "${campaignName}" pausada com sucesso.`,
            pendingAction: false,
          };
        } else {
          return {
            text: `Campanha "${campaignName}" foi iniciada.`,
            pendingAction: false,
          };
        }
      }

      // Read-only tool — execute and feed back
      const { result, stateChanged } = await executeTool(
        toolCall.name,
        businessId,
        toolCall.args,
      );

      if (result.error) {
        messages.push({
          role: "assistant",
          content: response.text || "Vou verificar isso...",
        });
        messages.push({
          role: "user",
          content: `Erro ao executar ${toolCall.name}: ${String(result.error)}`,
        });
        response = await groqChat(messages, { toolChoice: "none" });
        return { text: response.text, pendingAction: false };
      }

      const resultStr = JSON.stringify(result, null, 2);
      messages.push({
        role: "assistant",
        content: response.text || "Deixe-me consultar...",
        tool_calls: [
          {
            id: toolCall.name,
            type: "function",
            function: { name: toolCall.name, arguments: "{}" },
          },
        ],
      });
      messages.push({
        role: "tool",
        tool_call_id: toolCall.name,
        content: resultStr,
      });

      response = await groqChat(messages, { toolChoice: "none" });
      return { text: response.text, pendingAction: false };
    }
  }

  // No tool calls — just text response
  return { text: response.text, pendingAction: false };
}

// --- TTS via ElevenLabs (com rotação de chaves) ---
export interface TtsResult {
  ok: boolean;
  /** Áudio MP3 (buffer) quando ok=true. */
  audio?: Buffer;
  /** true quando deve usar a voz nativa do navegador (quota/erro). */
  fallbackToBrowser: boolean;
  /** Motivo do fallback, para log no frontend. */
  fallbackReason?: "quota" | "error";
}

export async function textToSpeech(text: string): Promise<TtsResult> {
  const res = await callWithKeyRotation<Buffer>("elevenlabs", async (key) => {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.ai.agentVoiceId}?output_format=mp3_44100_128`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": key,
      },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.arrayBuffer().then((b) => Buffer.from(b));
    const textBody = response.headers
      .get("content-type")
      ?.includes("application/json")
      ? body.toString("utf8")
      : "";
    if (response.status < 200 || response.status >= 300) {
      return { status: response.status, body: textBody, value: body };
    }
    return { status: response.status, body: textBody, value: body };
  });

  if (res.ok && res.value) {
    return { ok: true, audio: res.value, fallbackToBrowser: false };
  }

  const isQuota = Boolean(
    res.error && isQuotaError(res.error.status, res.error.body),
  );
  if (isQuota) {
    logger.warn(
      "ElevenLabs sem créditos/quota — agente usará voz do navegador",
      { fallback: "quota" },
    );
  } else {
    logger.warn("ElevenLabs indisponível — agente usará voz do navegador", {
      fallback: "error",
      error: res.error?.body?.slice(0, 200) ?? res.error?.status,
    });
  }
  return {
    ok: false,
    fallbackToBrowser: true,
    fallbackReason: isQuota ? "quota" : "error",
  };
}
