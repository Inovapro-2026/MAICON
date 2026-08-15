/**
 * Tipos compartilhados do Prospector SAVYRON.
 * Definem o contrato entre API, worker, descoberta, normalização e persistência.
 */

export interface ProspectParams {
  runId: string;
  businessId: string;
  campaignId?: string;
  segment?: string;
  country?: string;
  state?: string;
  city?: string;
  targetQuantity: number;
  /** Termo exatamente como o usuário digitou (ex: "Barbeira"). */
  searchTermOriginal?: string;
  /** Nicho normalizado usado nas buscas (ex: "barbearia"). */
  normalizedNiche?: string;
}

/** Estado de uma execução, espelhado na ProspectionRun do banco. */
export type ProspectionRunStatus =
  "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";

/** Resultado bruto de uma busca de descoberta (Firecrawl/Mock). */
export interface SearchResult {
  url: string;
  title: string;
  description?: string;
}

/** Negócio candidato após normalização de um resultado de busca. */
export interface BusinessCandidate {
  name: string;
  website?: string;
  city?: string | null;
  state?: string | null;
  country?: string;
  title: string;
  description?: string;
  sourceUrl: string;
  phone?: string;
  email?: string;
}

/** Dados extraídos do site de um negócio. */
export interface ExtractedBusiness {
  phones: string[];
  emails: string[];
  instagram?: string;
  address?: string;
  contentPreview?: string;
}

/** Lead normalizado e pontuado, pronto para persistência. */
export interface QualifiedLead {
  name: string;
  phone?: string;
  email?: string;
  instagram?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  segment?: string;
  address?: string;
  leadScore: number;
  sourceUrl?: string;
  fingerprintDomain?: string;
  fingerprintNameCity?: string;
}

/** Motivo de descarte de um candidato. */
export type DiscardReason =
  | "NO_NAME"
  | "GENERIC_PAGE"
  | "NO_LOCATION_OR_CONTACT"
  | "NOT_A_BUSINESS"
  | "INVALID_SOURCE_URL"
  | "NO_SOURCE_URL"
  | "FABRICATED_DOMAIN"
  | "FABRICATED_EMAIL"
  | "INVALID_PHONE"
  | "INVALID_EMAIL"
  | "NO_CONTACT"
  | "NICHE_MISMATCH"
  | "LOCATION_MISMATCH";

/** Resultado de deduplicação de um candidato. */
export type DedupeOutcome =
  | { status: "NEW" }
  | { status: "DUPLICATE"; reason: string }
  | { status: "DISCARDED"; reason: DiscardReason };

/** Contador de progresso da execução (espelhado no banco e na UI). */
export interface ProspectionProgress {
  searched: number;
  found: number;
  crawled: number;
  extracted: number;
  duplicates: number;
  qualified: number;
  saved: number;
  errors: number;
  /** Itens descartados por não terem telefone nem e-mail (inutilizáveis). */
  discarded: number;
}

/** Interface do provedor de descoberta (Firecrawl real ou mock). */
export interface DiscoveryProvider {
  /** Busca negócios para uma query. Deve aplicar delay/rate limit quando real. */
  searchBusinesses(query: string, limit: number): Promise<SearchResult[]>;
  /** Acessa o site de um candidato e extrai contatos. */
  crawlBusiness(candidate: BusinessCandidate): Promise<ExtractedBusiness>;
  /** Encerra conexões do provedor. */
  close(): Promise<void>;
}

/** Interface de persistência/progresso usada pelo orquestrador (injetada pelo worker). */
export interface ProspectionRepository {
  /** Fingerprints já existentes na base do tenant. */
  existingKeys(businessId: string): Promise<{
    phones: Set<string>;
    emails: Set<string>;
    domains: Set<string>;
  }>;
  /** Atualiza o progresso da run no banco. */
  updateProgress(runId: string, progress: ProspectionProgress): Promise<void>;
  /** Persiste um lote de leads qualificados (cria Lead + CampaignLead). */
  persistBatch(
    runId: string,
    businessId: string,
    campaignId: string | null,
    leads: QualifiedLead[],
  ): Promise<{ saved: number; errors: number; phones: number; emails: number }>;
  /** Conclui a run com status e resumo. */
  complete(
    runId: string,
    status: ProspectionRunStatus,
    data: {
      avgScore?: number | null;
      summary?: Record<string, unknown>;
      error?: string | null;
    },
  ): Promise<void>;
}

/** Eventos de observabilidade estruturados. */
export interface ProspectionEvent {
  type: string;
  businessId: string;
  prospectionRunId: string;
  jobId?: string;
  [key: string]: unknown;
}
