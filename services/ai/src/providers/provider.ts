import {
  ChatMessage,
  GenerateOptions,
  LLMProvider,
  ProviderName,
  ProviderResult,
} from "../types";

/**
 * Remove raciocínio interno do modelo reasoning (ex.: qwen/qwen3.8-27b).
 * Suporta dois formatos observados no Groq:
 *  1) "<think>... raciocínio ...</think>" seguido da resposta real.
 *  2) "\n thinking\n... raciocínio ...\n response\n" seguido da resposta real.
 */
function cleanReasoning(raw: string): string {
  if (!raw) return "";
  let t = raw;
  if (/<thinking>/i.test(t) || /<think>/i.test(t)) {
    t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
    const close = t.lastIndexOf("</think>");
    if (close !== -1) t = t.slice(close + "</think>".length);
  }
  const r = t.indexOf("\n response\n");
  if (r !== -1) t = t.slice(r + "\n response\n".length);
  return t.replace(/^[\s\n]+/, "").replace(/\n*$/, "").replace(/```/g, "").trim();
}

/**
 * Base comum para provedores compatíveis com a API OpenAI
 * (OpenAI e Groq). Implementa chamada HTTP com fetch nativo.
 */
export abstract class OpenAICompatibleProvider implements LLMProvider {
  abstract readonly name: ProviderName;
  protected abstract readonly baseUrl: string;
  protected abstract readonly model: string;
  protected abstract readonly apiKey: string | undefined;

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(
    messages: ChatMessage[],
    options: GenerateOptions = {},
  ): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      throw new Error(`${this.name}: chave de API não configurada`);
    }

    const started = Date.now();
    const timeoutMs = options.timeoutMs ?? 30000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Rate limit (429) e 5xx são transitórios: retry com backoff e respeito ao
    // header Retry-After (a janela de TPM do free-tier se recupera em segundos).
    const MAX_RETRIES = 3;

    try {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const delayMs = 1500 * attempt;
          await new Promise((r) => setTimeout(r, delayMs));
        }
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            max_tokens: options.maxTokens ?? 500,
            temperature: options.temperature ?? 0.6,
            ...(options.topP !== undefined ? { top_p: options.topP } : { top_p: 0.95 }),
            ...(options.jsonMode
              ? { response_format: { type: "json_object" } }
              : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // 429 rate limit -> retryable; 5xx -> retryable; 4xx -> não retryable
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new Error(
            `${this.name}: HTTP ${res.status} ${body.slice(0, 300)}`,
          );
          if (retryable && attempt < MAX_RETRIES) {
            // Se o upstream mandou Retry-After, aguarda o tempo indicado (cap 8s).
            const retryAfter = res.headers.get("retry-after");
            const secs = retryAfter ? Number.parseInt(retryAfter, 10) : 0;
            if (Number.isFinite(secs) && secs > 0 && secs <= 8) {
              await new Promise((r) => setTimeout(r, secs * 1000));
            }
            continue;
          }
          break;
        }

        const data = (await res.json()) as {
          choices?: {
            message?: {
              content?: string | null;
              reasoning?: string | null;
              reasoning_content?: string | null;
            };
          }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const message = data.choices?.[0]?.message;
        // Remove blocos de raciocínio interno que modelos reasoning (ex.: qwen)
        // incluem no content — o cliente só vê a resposta final. Suporta dois
        // formatos: "<think>...</think>" e "\n thinking\n ... \n response\n".
        const text = cleanReasoning(message?.content ?? "");

        // O campo `reply` SÓ pode vir do conteúdo final destinado ao usuário.
        // reasoning / reasoning_content / analysis são internos e NUNCA são usados.
        if (!text) {
          const hasOnlyReasoning = Boolean(
            message?.reasoning || message?.reasoning_content,
          );
          throw new Error(
            `${this.name}: resposta vazia do provedor${hasOnlyReasoning ? " (apenas raciocínio interno; descartado)" : ""}`,
          );
        }

        return {
          text,
          model: this.model,
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - started,
        };
      }
      throw lastError ?? new Error(`${this.name}: falha desconhecida`);
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      throw new Error(
        `${this.name}: ${isAbort ? `timeout após ${timeoutMs}ms` : String(error instanceof Error ? error.message : error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
