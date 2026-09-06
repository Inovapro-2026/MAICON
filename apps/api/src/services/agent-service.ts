import { createLogger } from "@prospector/logger";
import { config } from "@prospector/config";
import { resolveApiKey, markApiKeyExhausted } from "./api-keys";

const logger = createLogger("api.agent");

const GROQ_BASE = "https://api.groq.com/openai/v1";

// --- Detecção de erro de quota (para rotação/fallback) ---
function isQuotaError(status: number, body: string): boolean {
  if (status === 401 || status === 429) return true;
  return /quota|credit|limit|remaining|character|insufficient|rate/i.test(body);
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
        const bodyLower = result.body.toLowerCase();
        if (bodyLower.includes("rate_limit") || bodyLower.includes("rate limit")) {
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
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

// --- Main chat handler — JARVIS (cérebro de consulta, somente leitura) ---
export async function processChat(
  businessId: string,
  userId: string,
  transcript: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<{ text: string; pendingAction: boolean }> {
  const { jarvisChat } = await import("./jarvis-service");
  return jarvisChat(businessId, userId, transcript, history);
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
  const { normalizeForTTS } = await import("./tts-normalizer");
  const ttsText = normalizeForTTS(text);

  const res = await callWithKeyRotation<Buffer>("elevenlabs", async (key) => {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.ai.agentVoiceId}?output_format=mp3_44100_128`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": key,
      },
      body: JSON.stringify({ text: ttsText, model_id: "eleven_multilingual_v2" }),
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