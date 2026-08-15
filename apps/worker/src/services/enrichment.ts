/**
 * Enriquecimento de leads via serviço Scrapy (prospector-scrapy, PM2).
 * O worker Node NUNCA chama `scrapy crawl` diretamente — comunica por HTTP
 * assíncrono com o serviço Python. Falhas aqui são toleradas (não quebram
 * o job de prospecção).
 *
 * A lógica pura de montagem do patch vive em @prospector/leads (testável);
 * este módulo cuida apenas da chamada HTTP ao serviço Scrapy.
 */
import { createLogger } from "@prospector/logger";
import type { EnrichmentData } from "@prospector/leads";

export { buildEnrichmentPatch } from "@prospector/leads";
export type { EnrichmentData };

const logger = createLogger("worker.enrichment");

/**
 * Chama o serviço Scrapy (`POST {baseUrl}/enrich {url}`) e retorna o resultado.
 * Retorna null em qualquer falha de rede/HTTP/timeout — tolerado pelo worker.
 */
export async function fetchEnrichment(
  url: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<{ success: boolean; data?: EnrichmentData; error?: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, timeoutMs }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.debug("Scrapy HTTP não-200", { url, status: res.status });
      return null;
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: EnrichmentData;
      error?: string;
    };
    return {
      success: Boolean(json.success),
      data: json.data,
      error: json.error,
    };
  } catch (error) {
    logger.debug("Enriquecimento indisponível (segue sem quebrar)", {
      url,
      error: (error as Error).message,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
