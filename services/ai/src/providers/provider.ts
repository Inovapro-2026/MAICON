import {
  ChatMessage,
  GenerateOptions,
  LLMProvider,
  ProviderResult,
} from "../types";

/**
 * Base comum para provedores compatíveis com a API OpenAI
 * (Groq e OpenRouter). Implementa chamada HTTP com fetch nativo.
 */
export abstract class OpenAICompatibleProvider implements LLMProvider {
  abstract readonly name: "groq" | "openrouter";
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

    // Free-tier upstreams (ex: OpenRouter :free) rate-limit com frequência;
    // 429/5xx são transitórios e merecem retry com pequeno backoff.
    const MAX_RETRIES = 2;

    try {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            ...(this.name === "openrouter"
              ? {
                  "HTTP-Referer":
                    process.env.NEXT_PUBLIC_APP_URL ||
                    "https://crm.inovapro.cloud",
                  "X-Title": "SAVYRON",
                }
              : {}),
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            max_tokens: options.maxTokens ?? 500,
            temperature: options.temperature ?? 0.7,
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
          if (retryable && attempt < MAX_RETRIES) continue;
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
        const text = message?.content?.trim() ?? "";

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
