/**
 * FONTE A — Google Maps (compass/google-maps-extractor).
 * Busca negócios por termo + localização e retorna dados estruturados
 * (nome, telefone, site, endereço, categoria). O add-on de enriquecimento
 * (company contacts) fica desligado por padrão para controlar custo.
 */
import { GoogleMapsRecord, RawApifyLead } from "./types";

export interface GoogleMapsInputOptions {
  /** Termos de busca (ex.: ["barbearia"]). */
  searchStringsArray: string[];
  /** Localização (ex.: "São Paulo, SP"). */
  locationQuery?: string;
  /** Teto de lugares por busca (custo por evento). */
  maxCrawledPlacesPerSearch: number;
}

/** Monta o input do actor compass/google-maps-extractor. */
export function buildGoogleMapsInput(
  options: GoogleMapsInputOptions,
): Record<string, unknown> {
  return {
    searchStringsArray: options.searchStringsArray,
    locationQuery: options.locationQuery ?? "",
    language: "pt",
    maxCrawledPlacesPerSearch: Math.max(1, options.maxCrawledPlacesPerSearch),
    // Enriquecimento de contatos é POR EVENTO — fica desligado; só ativamos
    // quando a busca principal não trouxer e-mail/telefone (ver worker).
    scrapeCompanyContacts: false,
    scrapeSocialMediaProfiles: {
      facebooks: false,
      instagrams: false,
      youtubes: false,
      tiktoks: false,
      twitters: false,
    },
    maximumLeadsEnrichmentRecords: 0,
  };
}

/** Mapeia um registro do Google Maps para um lead bruto. */
export function mapGoogleMapsRecord(record: GoogleMapsRecord): RawApifyLead | null {
  const name = String(record.title ?? "").trim();
  if (!name) return null;

  const phone = record.phoneUnformatted || record.phone || undefined;
  const city =
    String(record.city ?? "").trim() || undefined;

  return {
    source: "google_maps",
    externalId: record.placeId ?? undefined,
    name,
    phone,
    website: record.website?.trim() || undefined,
    address: record.address?.trim() || undefined,
    city,
    segment: record.categoryName?.trim() || undefined,
    sourceUrl:
      record.url?.trim() ||
      (record.placeId ? `https://www.google.com/maps/place/${record.placeId}` : undefined),
  };
}
