import { ChatMessage, GenerateOptions, LLMProvider, ProviderResult } from '../types';

/**
 * Base comum para provedores compatíveis com a API OpenAI
 * (Groq e OpenRouter). Implementa chamada HTTP com fetch nativo.
 */
export abstract class OpenAICompatibleProvider implements LLMProvider {
  abstract readonly name: 'groq' | 'openrouter';
  protected abstract readonly baseUrl: string;
  protected abstract readonly model: string;
  protected abstract readonly apiKey: string | undefined;

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      throw new Error(`${this.name}: chave de API não configurada`);
    }

    const started = Date.now();
    const timeoutMs = options.timeoutMs ?? 30000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...(this.name === 'openrouter'
            ? {
                'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://crm.inovapro.cloud',
                'X-Title': 'SAVYRON',
              }
            : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: options.maxTokens ?? 500,
          temperature: options.temperature ?? 0.7,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // 429 rate limit -> retryable; 5xx -> retryable; 4xx -> não retryable
        const retryable = res.status === 429 || res.status >= 500;
        throw new Error(
          `${this.name}: HTTP ${res.status} ${body.slice(0, 300)}`
        );
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) {
        throw new Error(`${this.name}: resposta vazia do provedor`);
      }

      return {
        text,
        model: this.model,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      throw new Error(
        `${this.name}: ${isAbort ? `timeout após ${timeoutMs}ms` : String(error instanceof Error ? error.message : error)}`
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
