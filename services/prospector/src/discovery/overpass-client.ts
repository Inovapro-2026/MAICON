/**
 * Cliente da Overpass API (OpenStreetMap).
 * Executa a query QL com retry + backoff para timeout/429/5xx.
 * Erros definitivos propagam — o orquestrador marca a run como FAILED.
 */
import { createLogger } from "@prospector/logger";
import { withRetry } from "@prospector/utils";
import { OverpassElement } from "./overpass-query";

const logger = createLogger("prospector.overpass");

export interface OverpassClientOptions {
  apiUrl: string;
  timeoutMs: number;
  retryAttempts: number;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Executa uma query Overpass QL e retorna os elementos OSM.
 * Lança erro após esgotar os retries (nunca retorna sucesso vazio disfarçado).
 */
export async function queryOverpass(
  ql: string,
  options: OverpassClientOptions,
): Promise<OverpassResponse> {
  const { apiUrl, timeoutMs, retryAttempts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await withRetry(
      async () => {
        const r = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent":
              "SAVYRON-Prospector/1.0 (prospecção comercial automatizada; contato: ops@inovapro.cloud)",
          },
          body: new URLSearchParams({ data: ql }),
          signal: controller.signal,
        });
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          const err = new Error(
            `Overpass HTTP ${r.status}: ${text.slice(0, 300)}`,
          );
          (err as unknown as { status?: number }).status = r.status;
          throw err;
        }
        const json = (await r.json()) as { elements?: OverpassElement[] };
        return { elements: json.elements ?? [] };
      },
      {
        maxAttempts: Math.max(1, retryAttempts),
        baseDelayMs: 2000,
        maxDelayMs: 15000,
        onRetry: (attempt, error) => {
          logger.warn("Overpass retry", {
            attempt,
            error: (error as Error).message,
          });
        },
        shouldRetry: (error) => {
          const status = (error as unknown as { status?: number }).status;
          return status === undefined || status === 429 || status >= 500;
        },
      },
    );
    return res;
  } finally {
    clearTimeout(timer);
  }
}
