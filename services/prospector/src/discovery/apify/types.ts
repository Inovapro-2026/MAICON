/**
 * Tipos da prospecção multi-plataforma via Apify.
 * Fontes: Google Maps (compass/google-maps-extractor) e Instagram
 * (apify/instagram-scraper). Dados brutos do actor → lead normalizado.
 */

export type ApifySource = "google_maps" | "instagram";

export const APIFY_SOURCES: readonly ApifySource[] = [
  "google_maps",
  "instagram",
];

/** Registro bruto do Google Maps Extractor (campos usados). */
export interface GoogleMapsRecord {
  title?: string;
  address?: string;
  city?: string;
  neighborhood?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  categoryName?: string;
  placeId?: string;
  totalScore?: number;
  reviewsCount?: number;
  url?: string;
  location?: { lat?: number; lng?: number };
}

/** Registro bruto do Instagram Scraper (campos usados). */
export interface InstagramRecord {
  username?: string;
  fullName?: string;
  biography?: string;
  externalUrl?: string;
  followersCount?: number;
  postsCount?: number;
  isBusinessAccount?: boolean;
  category?: string;
  url?: string;
}

/** Lead normalizado e já enriquecido, antes da deduplicação entre fontes. */
export interface RawApifyLead {
  /** Fonte de origem ("google_maps" | "instagram"). */
  source: ApifySource;
  /** Identificador externo da fonte (placeId / username). */
  externalId?: string;
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  instagramUsername?: string;
  bio?: string;
  address?: string;
  city?: string;
  segment?: string;
  followersCount?: number;
  sourceUrl?: string;
}

/** Lead consolidado após deduplicação entre fontes (pronto para persistir). */
export interface ConsolidatedLead extends RawApifyLead {
  /** Todas as fontes que contribuíram para este lead. */
  sources: ApifySource[];
}

/** Resultado de uma execução multi-fonte. */
export interface ApifyProspectionResult {
  found: number;
  saved: number;
  duplicates: number;
  errors: number;
  usage: { source: ApifySource; count: number }[];
  /** run.id / datasetId para investigar via console.apify.com. */
  runIds: { source: ApifySource; actorRunId: string; datasetId: string }[];
}
