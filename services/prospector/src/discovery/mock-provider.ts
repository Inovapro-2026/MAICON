/**
 * Provedor de descoberta MOCK para testes unitários e teste de carga.
 * Nunca chama Firecrawl. Gera negócios determinísticos por query.
 */
import {
  BusinessCandidate,
  DiscoveryProvider,
  ExtractedBusiness,
  SearchResult,
} from "../types";

const NAMES = [
  "Barbearia do João",
  "Salão Estilo & Cia",
  "Clínica Sorriso Perfeito",
  "Academia Corpo em Forma",
  "Pet Shop Amigo Fiel",
  "Restaurante Sabor Caseiro",
  "Studio Pilates Vida",
  "Estética Renovare",
  "Barbearia Imperial",
  "Salão Beleza Pura",
];

export interface MockProviderOptions {
  /** Aplica delay aleatório e rate limit? Default false (testes rápidos). */
  simulateThrottle?: boolean;
  minDelayMs?: number;
  maxDelayMs?: number;
  /** Seed para variar resultados entre queries. */
  seedOffset?: number;
}

export class MockDiscoveryProvider implements DiscoveryProvider {
  constructor(private options: MockProviderOptions = {}) {}

  private async maybeThrottle(): Promise<void> {
    if (!this.options.simulateThrottle) return;
    const { minDelayMs = 5, maxDelayMs = 15 } = this.options;
    const ms = Math.floor(
      minDelayMs + Math.random() * (maxDelayMs - minDelayMs),
    );
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async searchBusinesses(
    query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    await this.maybeThrottle();
    const offset = (this.options.seedOffset ?? 0) + query.length;
    const results: SearchResult[] = [];
    for (let i = 0; i < Math.min(limit, 6); i += 1) {
      const name = NAMES[(offset + i) % NAMES.length];
      results.push({
        url: `https://${name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "")
          .slice(0, 20)}-${offset + i}.exemplo.com.br`,
        title: name,
        description: `${name} - especialistas em atendimento em ${query}`,
      });
    }
    return results;
  }

  async crawlBusiness(
    candidate: BusinessCandidate,
  ): Promise<ExtractedBusiness> {
    await this.maybeThrottle();
    const seed = candidate.name.length;
    return {
      phones: [
        `+5511${String(90000 + (seed % 9000)).slice(0, 4)}${String(seed).padStart(4, "0")}`,
      ],
      emails: [
        `contato@${candidate.website?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "mock"}`,
      ],
      instagram:
        seed % 2 === 0
          ? `${candidate.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`
          : undefined,
      address: `Rua Exemplo, 123 - Centro`,
      contentPreview: `${candidate.name}: telefone, e-mail e endereço disponíveis.`,
    };
  }

  async close(): Promise<void> {
    // no-op
  }
}
