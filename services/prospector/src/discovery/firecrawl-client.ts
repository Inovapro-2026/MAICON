/**
 * Cliente centralizado do Firecrawl.
 * Controla: API key, timeout, retry com backoff, rate limit (via RedisRateLimiter),
 * logs estruturados, métricas de erro. Nenhuma chamada Firecrawl fora daqui.
 */
import { createLogger } from "@prospector/logger";
import { maskSensitive, withRetry } from "@prospector/utils";
import { RedisRateLimiter } from "../rate-limiter";
import { SearchResult } from "../types";

const logger = createLogger("prospector.firecrawl");

export interface FirecrawlClientOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  retryAttempts: number;
  rateLimiter: RedisRateLimiter;
  businessId: string;
  /** Delay aleatório antes de cada request (controle de velocidade). */
  minDelayMs?: number;
  maxDelayMs?: number;
}

export interface ScrapeResult {
  markdown: string;
  title?: string;
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FirecrawlClient {
  private headers: Record<string, string>;

  constructor(private options: FirecrawlClientOptions) {
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    };
  }

  private async request<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const {
      baseUrl,
      timeoutMs,
      retryAttempts,
      rateLimiter,
      businessId,
      minDelayMs,
      maxDelayMs,
    } = this.options;

    // Delay aleatório antes de cada operação (no worker, nunca no HTTP).
    if (minDelayMs && maxDelayMs) await randomDelay(minDelayMs, maxDelayMs);
    // Rate limit global + por tenant (compartilhado entre workers).
    await rateLimiter.wait(businessId);

    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await withRetry(
        async () => {
          const res = await fetch(url, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            const err = new Error(
              `Firecrawl HTTP ${res.status}: ${text.slice(0, 300)}`,
            );
            (err as unknown as { status?: number }).status = res.status;
            throw err;
          }
          const json = (await res.json()) as T;
          return json;
        },
        {
          maxAttempts: retryAttempts,
          baseDelayMs: 1500,
          maxDelayMs: 15000,
          onRetry: (attempt, error) => {
            logger.warn("Firecrawl retry", {
              path,
              attempt,
              error: (error as Error).message,
            });
          },
          shouldRetry: (error) => {
            const status = (error as unknown as { status?: number }).status;
            // Retenta em 429/5xx/erros de rede, não em 4xx definitivos.
            return status === undefined || status === 429 || status >= 500;
          },
        },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Busca negócios.
   *
   * REGRA DE PRODUÇÃO: erros NUNCA são engolidos aqui. Depois de esgotados os
   * retries (429/5xx/timeout) ou em erros definitivos (4xx), a exceção propaga
   * para o orquestrador — que marca a run como FAILED com o motivo no summary.
   * Retornar `[]` em silêncio disfarçaria a falha como "parcial com zero leads".
   */
  async search(query: string, limit: number): Promise<SearchResult[]> {
    const res = await this.request<{
      data?: Array<{ url: string; title?: string; description?: string }>;
    }>("/v1/search", { query, limit, lang: "pt" });
    const data = (res.data ?? []).filter((r) => r?.url);
    logger.info("Firecrawl search ok", {
      businessId: this.options.businessId,
      query,
      results: data.length,
    });
    return data.map((r) => ({
      url: r.url,
      title: r.title ?? "",
      description: r.description,
    }));
  }

  /**
   * Acessa uma URL e extrai o conteúdo em markdown.
   * Erros de HTTP/rede propagam para o provider (que decide engolir por site,
   * para não derrubar a run inteira por um único site fora do ar).
   */
  async scrape(url: string): Promise<ScrapeResult | null> {
    const res = await this.request<{
      data?: {
        markdown?: string;
        html?: string;
        metadata?: { title?: string };
      };
    }>("/v1/scrape", {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    });
    const data = res.data;
    if (!data || !data.markdown) return null;
    return {
      markdown: data.markdown.slice(0, 60000),
      title: data.metadata?.title,
    };
  }

  /** Para logs: nunca expor a chave. */
  describe(): { apiKeyMasked: string; baseUrl: string } {
    return {
      apiKeyMasked: maskSensitive(this.options.apiKey),
      baseUrl: this.options.baseUrl,
    };
  }
}
