/**
 * Orquestrador da prospecção.
 *
 * Pipeline: validar → montar queries → buscar → normalizar → validar → deduplicar
 * → crawlear → extrair → pontuar → persistir em lotes.
 *
 * Requisitos de produção atendidos:
 * - memória controlada (processa em stream, persiste em lotes);
 * - cancelamento seguro (verifica estado entre operações);
 * - progresso incremental persistido;
 * - isolamento multi-tenant (runId/businessId vêm do job, nunca do frontend);
 * - delay e rate limit delegados ao provedor (worker, nunca no HTTP);
 * - NUNCA fabrica dados: só persiste o que passou por validateDiscoveredLead
 *   (origem verificável, domínio/e-mail/telefone reais, relevância e localização).
 */
import { createLogger } from "@prospector/logger";
import { buildSearchQueries, queryFingerprint } from "./query-builder";
import {
  extractEmails,
  extractLocationFromText,
  extractPhones,
  normalizeBusinessName,
  normalizeCity,
  normalizeCountry,
  normalizeDomain,
  normalizeState,
} from "./normalizer";
import { validateCandidate, validateDiscoveredLead } from "./validator";
import { ProspectionDeduplicator } from "./deduplicator";
import { scoreLead, summarizeScores } from "./scoring";
import {
  DiscoveryProvider,
  ProspectionProgress,
  ProspectionRepository,
  ProspectParams,
  ProspectionRunStatus,
  QualifiedLead,
  SearchResult,
} from "./types";

const logger = createLogger("prospector.orchestrator");

export interface OrchestratorOptions {
  provider: DiscoveryProvider;
  repository: ProspectionRepository;
  config: {
    maxResultsPerSearch: number;
    batchSize: number;
    maxLeadsPerRun: number;
  };
  /** Chamado periodicamente para saber se a run foi cancelada. */
  isCancelled: () => Promise<boolean>;
}

export interface OrchestratorResult {
  status: Exclude<ProspectionRunStatus, "PENDING" | "RUNNING">;
  summary: Record<string, unknown>;
  avgScore: number | null;
}

export async function runProspection(
  params: ProspectParams,
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const { provider, repository, config, isCancelled } = options;
  const {
    runId,
    businessId,
    campaignId,
    segment,
    country,
    state,
    city,
    searchTermOriginal,
    normalizedNiche,
  } = params;

  const targetQuantity = Math.max(
    1,
    Math.min(params.targetQuantity, config.maxLeadsPerRun),
  );
  // Pede à fonte o máximo de resultados configurado por busca. O teto de 10
  // antes limitava a descoberta: com target grande a run parava em ~20 encontrados.
  const searchLimit = Math.max(1, config.maxResultsPerSearch);

  const baseLog = { businessId, prospectionRunId: runId };
  const requested = { segment, country, state, city };

  // Fingerprints da base existente do tenant (carregados uma vez).
  const existing = await repository.existingKeys(businessId);
  const deduplicator = new ProspectionDeduplicator(existing);

  const progress: ProspectionProgress = {
    searched: 0,
    found: 0,
    crawled: 0,
    extracted: 0,
    duplicates: 0,
    qualified: 0,
    saved: 0,
    errors: 0,
    discarded: 0,
  };

  const scores: number[] = [];
  let batch: QualifiedLead[] = [];
  const queryCounts: Record<string, number> = {};
  const errorsLog: string[] = [];
  const seenQueries = new Set<string>();

  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    // Nunca ultrapassa a meta: trunca o lote pelo orçamento restante.
    const remaining = targetQuantity - progress.saved;
    if (remaining <= 0) {
      batch = [];
      return;
    }
    if (batch.length > remaining) batch = batch.slice(0, remaining);
    const res = await repository.persistBatch(
      runId,
      businessId,
      campaignId ?? null,
      batch,
    );
    progress.saved += res.saved;
    progress.errors += res.errors;
    if (res.saved > 0) {
      logger.info("LEAD_CREATED", {
        ...baseLog,
        saved: res.saved,
        errors: res.errors,
      });
    }
    batch = [];
    await repository.updateProgress(runId, progress);
  }

  const reachedTarget = () => progress.saved + batch.length >= targetQuantity;

  const reject = (result: SearchResult, reason: string, name?: string) => {
    logger.info("RESULT_REJECTED", {
      ...baseLog,
      reason,
      name: name ?? result.title ?? result.url,
      url: result.url,
    });
  };

  try {
    const queries = buildSearchQueries({
      segment,
      country,
      state,
      city,
      targetQuantity,
    });

    for (const q of queries) {
      // Cancelamento seguro entre operações.
      if (await isCancelled()) {
        await flush();
        await repository.complete(runId, "CANCELLED", {
          avgScore: avgOf(scores),
        });
        return {
          status: "CANCELLED",
          summary: buildSummary(progress, scores, queryCounts, errorsLog, {
            searchTermOriginal,
            normalizedNiche,
          }),
          avgScore: avgOf(scores),
        };
      }

      // Chegou na meta: para de buscar.
      if (reachedTarget()) break;

      const fp = queryFingerprint(q.query);
      if (seenQueries.has(fp)) continue;
      seenQueries.add(fp);

      logger.info("DISCOVERY_REQUEST", {
        ...baseLog,
        query: q.query,
        limit: searchLimit,
      });
      progress.searched += 1;
      const results: SearchResult[] = await provider.searchBusinesses(
        q.query,
        searchLimit,
      );
      progress.found += results.length;
      queryCounts[q.query] = results.length;
      logger.info("DISCOVERY_RESULTS_RECEIVED", {
        ...baseLog,
        query: q.query,
        results: results.length,
      });
      // Persiste o contador de encontrados IMEDIATAMENTE (antes do crawl),
      // para a UI mostrar "Encontrados" em tempo real e o run não parecer
      // "sem busca" enquanto os sites são crawleados.
      await repository.updateProgress(runId, progress);

      for (const result of results) {
        if (reachedTarget()) break;

        const candidate = normalizeCandidate(result, q.region ?? {});
        if (!candidate) {
          reject(result, "NO_NAME");
          continue;
        }

        // Validação básica de página (portais, 404, agregadores).
        const basic = validateCandidate(candidate);
        if (!basic.valid) {
          reject(result, basic.reason ?? "INVALID", candidate.name);
          continue;
        }

        // Integridade + relevância + localização (antes do crawl).
        const pre = validateDiscoveredLead(candidate, requested);
        if (!pre.valid) {
          reject(result, pre.reason ?? "REJECTED", candidate.name);
          continue;
        }
        logger.debug("RESULT_VALIDATED", {
          ...baseLog,
          name: candidate.name,
          url: result.url,
        });

        // Deduplica contra a execução e a base.
        const outcome = deduplicator.check({
          phone: candidate.phone,
          email: candidate.email,
          website: candidate.website,
          name: candidate.name,
          city: candidate.city,
        });
        if (outcome.status !== "NEW") {
          progress.duplicates += 1;
          logger.debug("LEAD_DEDUPLICATED", {
            ...baseLog,
            reason: outcome.reason,
            name: candidate.name,
          });
          continue;
        }

        // Crawleia o site (se houver) para extrair contatos. Pula o crawl
        // quando o próprio snippet da busca já traz telefone E e-mail — evita
        // crawlear dezenas de sites (lento quando o provedor limita a taxa)
        // para resultados que já têm contato suficiente.
        let extracted: {
          phones: string[];
          emails: string[];
          instagram?: string;
          address?: string;
          contentPreview?: string;
        } = {
          phones: [],
          emails: [],
        };
        const hasBothContacts = Boolean(candidate.phone && candidate.email);
        if ((candidate.website || candidate.sourceUrl) && !hasBothContacts) {
          progress.crawled += 1;
          extracted = await provider.crawlBusiness(candidate);
          if (
            extracted.phones.length > 0 ||
            extracted.emails.length > 0 ||
            extracted.instagram
          ) {
            progress.extracted += 1;
          }
          await repository.updateProgress(runId, progress);
        }

        const phone = extracted.phones[0] ?? candidate.phone;
        const email = extracted.emails[0] ?? candidate.email;
        const instagram = extracted.instagram;
        const address = extracted.address;

        // Evidência de localização encontrada no conteúdo do site.
        const contentEvidence = extractLocationFromText(
          `${candidate.title} ${candidate.description ?? ""} ${extracted.contentPreview ?? ""}`,
        );
        const effectiveCity = contentEvidence?.city ?? candidate.city;
        const effectiveState = contentEvidence?.state ?? candidate.state;

        // Revalida com contatos extraídos e conteúdo (nunca fabrica dados).
        const post = validateDiscoveredLead(
          {
            ...candidate,
            phone,
            email,
            city: effectiveCity,
            state: effectiveState,
            contentPreview: extracted.contentPreview,
          },
          requested,
        );
        if (!post.valid) {
          reject(result, post.reason ?? "REJECTED", candidate.name);
          continue;
        }

        // Contato obrigatório: sem telefone nem e-mail, o lead é inutilizável
        // para contato — é descartado (não salvo) e contabilizado separadamente
        // para o usuário entender que a fonte trouxe resultados sem contato.
        if (!phone && !email) {
          progress.discarded += 1;
          reject(result, "NO_CONTACT", candidate.name);
          continue;
        }

        const leadScore = scoreLead({
          phone,
          email,
          instagram,
          website: candidate.website,
          city: effectiveCity,
          segment,
          address,
        });
        scores.push(leadScore);
        progress.qualified += 1;

        batch.push({
          name: candidate.name,
          phone,
          email,
          instagram,
          website: candidate.website,
          city: effectiveCity ?? undefined,
          state: effectiveState ?? undefined,
          country: candidate.country,
          segment,
          address,
          leadScore,
          sourceUrl: candidate.sourceUrl,
          fingerprintDomain: candidate.website
            ? (normalizeDomain(candidate.website) ?? undefined)
            : undefined,
          fingerprintNameCity: `${candidate.name}|${effectiveCity ?? ""}`,
        });

        // Persiste imediatamente CADA lead qualificado (flush por candidato):
        // o crawl é lento (rate limit do provedor) e a tabela de Resultados
        // lê do banco — sem isso ela ficaria vazia por vários minutos durante
        // a execução. O custo (uma transação por lead) é aceitável no worker.
        await flush();
      }

      // Persiste o lote ao final de CADA query (e atualiza o progresso), para
      // que os leads apareçam na tabela de Resultados DURANTE a execução — não
      // só quando a run termina ou o lote estoura.
      await flush();
    }
    // Lote residual.
    await flush();

    // COMPLETED só quando atinge a meta; PARTIAL quando há resultado real
    // porém abaixo do solicitado; FAILED quando não salvou nada por erro.
    const status: "COMPLETED" | "PARTIAL" | "FAILED" =
      progress.errors > 0 && progress.saved === 0
        ? "FAILED"
        : progress.saved >= targetQuantity
          ? "COMPLETED"
          : "PARTIAL";
    const summary = buildSummary(progress, scores, queryCounts, errorsLog, {
      searchTermOriginal,
      normalizedNiche,
    });

    if (status === "PARTIAL") {
      logger.info("PROSPECTION_PARTIAL", {
        ...baseLog,
        status,
        targetQuantity,
        saved: progress.saved,
        found: progress.found,
        duplicates: progress.duplicates,
      });
    } else {
      logger.info("PROSPECTION_COMPLETED", {
        ...baseLog,
        status,
        saved: progress.saved,
        found: progress.found,
        duplicates: progress.duplicates,
      });
    }

    await repository.complete(runId, status, {
      avgScore: avgOf(scores),
      summary,
    });
    return { status, summary, avgScore: avgOf(scores) };
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    errorsLog.push(message);
    progress.errors += 1;
    await flush().catch(() => undefined);
    const finalStatus: ProspectionRunStatus =
      progress.saved > 0 ? "PARTIAL" : "FAILED";
    logger.error(
      finalStatus === "PARTIAL" ? "PROSPECTION_PARTIAL" : "PROSPECTION_FAILED",
      {
        ...baseLog,
        error: message,
        saved: progress.saved,
      },
    );
    await repository
      .complete(runId, finalStatus, {
        avgScore: avgOf(scores),
        summary: buildSummary(progress, scores, queryCounts, errorsLog, {
          searchTermOriginal,
          normalizedNiche,
        }),
        error: message,
      })
      .catch((e) => {
        logger.error("Falha ao finalizar run", {
          ...baseLog,
          error: (e as Error).message,
        });
      });
    throw error;
  }
}

function avgOf(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function buildSummary(
  progress: ProspectionProgress,
  scores: number[],
  queryCounts: Record<string, number>,
  errorsLog: string[],
  niche: { searchTermOriginal?: string; normalizedNiche?: string },
): Record<string, unknown> {
  const quality = summarizeScores(scores);
  const summary: Record<string, unknown> = {
    ...progress,
    ...quality,
    queries: Object.keys(queryCounts).length,
    queryCounts,
    errors: errorsLog.slice(0, 20),
  };
  if (niche.searchTermOriginal)
    summary.search_term_original = niche.searchTermOriginal;
  if (niche.normalizedNiche) summary.normalized_niche = niche.normalizedNiche;
  return summary;
}

/** Converte um resultado de busca em candidato (com dados já presentes). */
function normalizeCandidate(
  result: SearchResult,
  region: { city?: string; state?: string; country?: string },
): {
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
} | null {
  const title = (result.title ?? "").trim();
  if (!title) return null;

  // Nome: extrai do título removendo sufixos de página.
  const name = normalizeBusinessName(
    title.replace(
      /\s*-\s*(Início|Home|Contato|Página inicial|Site Oficial)$/i,
      "",
    ),
  );

  // Evidência explícita de localização no título/descrição (Cidade - UF).
  const evidence = extractLocationFromText(
    `${title} ${result.description ?? ""}`,
  );
  const city = normalizeCity(evidence?.city ?? region.city);
  const state = normalizeState(evidence?.state ?? region.state);
  const country = normalizeCountry(region.country);

  // Detecta contatos já presentes na descrição do resultado.
  const text = `${title} ${result.description ?? ""}`;
  const phones = extractPhones(text);
  const emails = extractEmails(text);

  return {
    name,
    website:
      result.url &&
      !/google\.|facebook\.|instagram\.|whatsapp\./i.test(result.url)
        ? result.url
        : undefined,
    city,
    state,
    country,
    title,
    description: result.description,
    sourceUrl: result.url,
    phone: phones[0],
    email: emails[0],
  };
}
