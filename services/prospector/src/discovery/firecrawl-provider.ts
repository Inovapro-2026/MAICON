/**
 * Provedor de descoberta via Firecrawl.
 * Busca negócios e acessa o site (página inicial + páginas de contato prioritárias),
 * respeitando delay aleatório, rate limit e limite de páginas por domínio.
 */
import { createLogger } from "@prospector/logger";
import { FirecrawlClient } from "./firecrawl-client";
import {
  extractEmails,
  extractInstagram,
  extractPhones,
  normalizeAddress,
} from "../normalizer";
import {
  BusinessCandidate,
  DiscoveryProvider,
  ExtractedBusiness,
  SearchResult,
} from "../types";

const logger = createLogger("prospector.firecrawl-provider");

const CONTACT_PATHS = [
  "/contato",
  "/contact",
  "/sobre",
  "/about",
  "/quem-somos",
  "/quem-somos-nos",
];

export interface FirecrawlProviderOptions {
  client: FirecrawlClient;
  maxPagesPerDomain: number;
}

export class FirecrawlProvider implements DiscoveryProvider {
  private visitedPages = new Map<string, number>();

  constructor(private options: FirecrawlProviderOptions) {}

  async searchBusinesses(
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    const results = await this.options.client.search(query, limit);
    return results.map((r) => ({
      url: r.url,
      title: r.title,
      description: r.description,
    }));
  }

  async crawlBusiness(
    candidate: BusinessCandidate,
  ): Promise<ExtractedBusiness> {
    const { client, maxPagesPerDomain } = this.options;
    const domain = new URL(candidate.website || candidate.sourceUrl).hostname;
    const visited = this.visitedPages.get(domain) ?? 0;
    const budget = maxPagesPerDomain - visited;
    if (budget <= 0) return { phones: [], emails: [] };

    const pages = [candidate.website || candidate.sourceUrl];
    // Tenta páginas de contato, respeitando o limite por domínio.
    const base = new URL(candidate.website || candidate.sourceUrl);
    for (const path of CONTACT_PATHS.slice(0, budget - 1)) {
      pages.push(new URL(path, base).toString());
    }

    const phones = new Set<string>();
    const emails = new Set<string>();
    let instagram: string | undefined;
    let address: string | undefined;
    const contentPieces: string[] = [];

    for (const page of pages.slice(0, budget)) {
      // Site fora do ar/timeout não derruba a run: registra e segue.
      let scraped: Awaited<ReturnType<FirecrawlClient["scrape"]>> = null;
      try {
        scraped = await client.scrape(page);
      } catch (error) {
        logger.warn("Site não pôde ser analisado", {
          domain,
          url: page,
          error: (error as Error).message,
        });
        continue;
      }
      if (!scraped) continue;
      const text = scraped.markdown;
      if (!text) continue;

      for (const p of extractPhones(text)) phones.add(p);
      for (const e of extractEmails(text)) emails.add(e);
      if (!instagram) instagram = extractInstagram(text);
      if (!address) {
        const addr = normalizeAddress(extractAddress(text));
        if (addr) address = addr;
      }
      contentPieces.push(text.slice(0, 800));
      this.visitedPages.set(domain, (this.visitedPages.get(domain) ?? 0) + 1);
    }

    if (this.visitedPages.get(domain) === undefined) {
      this.visitedPages.set(domain, 0);
    }

    logger.info("Site analisado", {
      domain,
      pages: this.visitedPages.get(domain),
      phones: phones.size,
      emails: emails.size,
      instagram: Boolean(instagram),
    });

    return {
      phones: [...phones].slice(0, 3),
      emails: [...emails].slice(0, 2),
      instagram,
      address,
      contentPreview: contentPieces.join("\n").slice(0, 4000),
    };
  }

  async close(): Promise<void> {
    // Nada a fechar: o cliente compartilha o Redis do rate limiter.
  }
}

/** Heurística simples de endereço a partir do markdown. */
function extractAddress(text: string): string | undefined {
  const m = text.match(
    /(Rua|Av\.|Avenida|Alameda|Praça|Praca|Travessa|Rodovia)[^\n]{3,120}/i,
  );
  return m?.[0];
}
