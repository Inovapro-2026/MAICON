/**
 * Provedor de descoberta via Overpass API (OpenStreetMap) — fonte GRATUITA.
 *
 * Fluxo: resolve o bbox da região (Nominatim) → monta a query QL a partir do
 * segmento mapeado → consulta a Overpass → converte os elementos OSM em
 * SearchResult reais (nome, telefone, e-mail, instagram, cidade/estado, site).
 *
 * REGRAS:
 * - Segmento sem mapeamento → erro claro (a run vai para FAILED, nunca
 *   "sucesso silencioso com zero");
 * - Localização não resolvível → erro claro;
 * - Nada é fabricado: os contatos vêm exclusivamente dos tags do OSM.
 */
import { createLogger } from "@prospector/logger";
import { extractInstagram } from "../normalizer";
import {
  BusinessCandidate,
  DiscoveryProvider,
  ExtractedBusiness,
  SearchResult,
} from "../types";
import {
  buildOverpassQuery,
  GeoBBox,
  parseOverpassElements,
  segmentToOverpassFilters,
} from "./overpass-query";
import { geocodeRegion } from "./nominatim-client";
import { queryOverpass } from "./overpass-client";

const logger = createLogger("prospector.overpass-provider");

export interface OverpassProviderOptions {
  businessId: string;
  segment?: string;
  country?: string;
  state?: string;
  city?: string;
  targetQuantity?: number;
  apiUrl: string;
  timeoutMs: number;
  retryAttempts: number;
  nominatimUrl: string;
}

export class OverpassProvider implements DiscoveryProvider {
  private readonly filters: string[];
  private readonly directMapped: boolean;
  private bboxPromise: Promise<GeoBBox | null> | null = null;

  constructor(private options: OverpassProviderOptions) {
    const mapping = segmentToOverpassFilters(options.segment);
    this.filters = mapping.filters;
    this.directMapped = mapping.direct;
  }

  private bbox(): Promise<GeoBBox | null> {
    if (!this.bboxPromise) {
      this.bboxPromise = geocodeRegion(
        {
          country: this.options.country,
          state: this.options.state,
          city: this.options.city,
        },
        { apiUrl: this.options.nominatimUrl, timeoutMs: 15000 },
      );
    }
    return this.bboxPromise;
  }

  async searchBusinesses(
    _query: string,
    limit: number,
  ): Promise<SearchResult[]> {
    // Segmento sem tag OSM direta usa fallback de busca por nome. Logamos para
    // a equipe ampliar o mapeamento com os termos reais digitados pelos
    // usuários — mas a busca SEMPRE é tentada (nunca "não suportado").
    if (!this.directMapped) {
      logger.info("Segmento sem tag OSM mapeada — usando busca por nome", {
        businessId: this.options.businessId,
        segment: this.options.segment ?? "",
      });
    }

    const bbox = await this.bbox();
    if (!bbox) {
      throw new Error(
        "Não foi possível resolver a localização alvo para a Overpass API (cidade/estado/país não encontrados no geocoding).",
      );
    }

    const ql = buildOverpassQuery({
      filters: this.filters,
      bbox,
      limit: Math.min(Math.max(1, limit), 50),
      timeoutSeconds: Math.floor(this.options.timeoutMs / 1000),
    });

    const res = await queryOverpass(ql, {
      apiUrl: this.options.apiUrl,
      timeoutMs: this.options.timeoutMs,
      retryAttempts: this.options.retryAttempts,
    });

    const results = parseOverpassElements(
      res.elements,
      this.options.city,
      this.options.state,
    );
    logger.info("Overpass results", {
      businessId: this.options.businessId,
      segment: this.options.segment,
      results: results.length,
    });
    return results;
  }

  async crawlBusiness(
    candidate: BusinessCandidate,
  ): Promise<ExtractedBusiness> {
    // Os contatos já vêm dos tags do OSM (fonte primária); não fazemos crawl do
    // site aqui. Repassamos o que a fonte real informou — nada é fabricado.
    const text = `${candidate.title} ${candidate.description ?? ""}`;
    return {
      phones: candidate.phone ? [candidate.phone] : [],
      emails: candidate.email ? [candidate.email] : [],
      instagram: extractInstagram(text),
    };
  }

  async close(): Promise<void> {
    // Sem conexões persistentes.
  }
}
