/**
 * Prospector SAVYRON — serviço de prospecção web.
 * Responsável por: descoberta (Firecrawl), normalização, deduplicação,
 * scoring, orquestração e métricas. Independente do HTTP (roda no worker).
 *
 * REGRA DE PRODUÇÃO: o fluxo real NUNCA usa dados fabricados. O provider
 * Mock existe APENAS para testes automatizados e é importado diretamente
 * pelos arquivos de teste — nunca pelo fluxo de produção.
 */
import { config } from "@prospector/config";
import { FirecrawlClient } from "./discovery/firecrawl-client";
import { FirecrawlProvider } from "./discovery/firecrawl-provider";
import { OverpassProvider } from "./discovery/overpass-provider";
import { MockDiscoveryProvider } from "./discovery/mock-provider";
import { RedisRateLimiter } from "./rate-limiter";
import { DiscoveryProvider } from "./types";

export * from "./types";
export * from "./query-builder";
export * from "./normalizer";
export * from "./validator";
export * from "./scoring";
export * from "./deduplicator";
export * from "./rate-limiter";
export * from "./orchestrator";
export * from "./metrics";
export * from "./discovery/overpass-query";
export * from "./discovery/overpass-client";
export * from "./discovery/apify";
export { FirecrawlClient, FirecrawlProvider, OverpassProvider };

/**
 * Provider mock — APENAS para testes automatizados. O fluxo de produção
 * nunca o instancia (buildDiscoveryProvider lança DiscoveryUnavailableError
 * quando o Firecrawl não está configurado).
 */
export { MockDiscoveryProvider };

/** Mensagem exibida quando o mecanismo de descoberta real não está configurado. */
export const PROSPECTION_DISCOVERY_UNAVAILABLE =
  "Prospecção indisponível: mecanismo de descoberta não configurado.";

export class DiscoveryUnavailableError extends Error {
  constructor() {
    super(PROSPECTION_DISCOVERY_UNAVAILABLE);
    this.name = "DiscoveryUnavailableError";
  }
}

export interface BuildProviderOptions {
  businessId: string;
  segment?: string;
  country?: string;
  state?: string;
  city?: string;
  targetQuantity?: number;
}

/**
 * Constrói o provedor de descoberta conforme PROSPECTOR_PROVIDER:
 * - 'firecrawl': Firecrawl; sem FIRECRAWL_API_KEY lança DiscoveryUnavailableError.
 * - 'overpass': Overpass API (OSM), gratuito, sem chave.
 * - 'auto' (padrão): Firecrawl se a chave existir; senão, Overpass.
 * NUNCA retorna um provedor mock para produção — dados fabricados são proibidos.
 */
export function buildDiscoveryProvider(options: BuildProviderOptions): {
  provider: DiscoveryProvider;
  rateLimiter: RedisRateLimiter | null;
} {
  const { businessId } = options;
  const mode = config.prospector.provider;
  const useFirecrawl =
    mode === "firecrawl" ||
    (mode === "auto" && Boolean(config.prospector.firecrawlApiKey));

  if (useFirecrawl) {
    if (!config.prospector.firecrawlApiKey) {
      throw new DiscoveryUnavailableError();
    }

    const rateLimiter = new RedisRateLimiter({
      redisUrl: config.redis.url,
      globalPerMinute: config.prospector.rateLimitPerMinute,
      globalWindowMs: config.prospector.rateLimitWindowMs,
      tenantPerHour: config.prospector.rateLimitPerTenantPerHour,
    });

    const client = new FirecrawlClient({
      apiKey: config.prospector.firecrawlApiKey,
      baseUrl: config.prospector.firecrawlBaseUrl,
      // Timeout POR REQUISIÇÃO (abort). Não usar jobTimeoutMs aqui — o job
      // inteiro pode durar vários minutos (muitas requisições); cada chamada
      // deve abortar rápido quando o provedor demora/limita.
      timeoutMs: config.prospector.requestTimeoutMs,
      retryAttempts: config.prospector.retryAttempts,
      rateLimiter,
      businessId,
      minDelayMs: config.prospector.minDelayMs,
      maxDelayMs: config.prospector.maxDelayMs,
    });

    const provider = new FirecrawlProvider({
      client,
      maxPagesPerDomain: config.prospector.maxPagesPerDomain,
    });

    return { provider, rateLimiter };
  }

  // Overpass API (OSM) — fonte gratuita, sem chave.
  const provider = new OverpassProvider({
    businessId,
    segment: options.segment,
    country: options.country,
    state: options.state,
    city: options.city,
    targetQuantity: options.targetQuantity,
    apiUrl: config.prospector.overpassApiUrl,
    timeoutMs: config.prospector.overpassTimeoutMs,
    retryAttempts: config.prospector.overpassRetryAttempts,
    nominatimUrl: config.prospector.nominatimApiUrl,
  });

  return { provider, rateLimiter: null };
}
