/**
 * Processador do job PROSPECTION.
 * É o único ponto do worker que conversa com o orquestrador + prisma.
 * Isolamento: businessId/runId vêm do job (gravados na criação pela sessão autenticada),
 * nunca de input externo durante o processamento.
 */
import { config } from "@prospector/config";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { QUEUE_NAMES } from "@prospector/queues";
import {
  buildDiscoveryProvider,
  DiscoveryUnavailableError,
  normalizeNiche,
  ProspectionRepository,
  prospectorMetrics,
  runProspection,
  ProspectParams,
  QualifiedLead,
  ProspectionRunStatus,
} from "@prospector/prospector";
import { publishRealtime, buildProspectingEvent } from "../services/realtime";
import { getWorkerQueue } from "../queues";

const logger = createLogger("worker.prospect");

interface ProspectJobData {
  runId: string;
  businessId: string;
  campaignId?: string;
  segment?: string;
  country?: string;
  state?: string;
  city?: string;
  targetQuantity: number;
}

/** Implementa o repositório sobre o Prisma (Neon). */
function createProspectionRepository(
  businessId: string,
  targetQuantity: number,
): ProspectionRepository {
  return {
    async existingKeys(businessId: string) {
      const LIMIT = 5000;
      const [phonesRows, emailsRows, domainsRows] = await Promise.all([
        prisma.lead.findMany({
          where: { business_id: businessId, phone: { not: null } },
          select: { phone: true },
          take: LIMIT,
        }),
        prisma.lead.findMany({
          where: { business_id: businessId, email: { not: null } },
          select: { email: true },
          take: LIMIT,
        }),
        prisma.lead.findMany({
          where: { business_id: businessId, fingerprint_domain: { not: null } },
          select: { fingerprint_domain: true },
          take: LIMIT,
        }),
      ]);

      return {
        phones: new Set(
          phonesRows.map((r) => r.phone).filter((v): v is string => Boolean(v)),
        ),
        emails: new Set(
          emailsRows
            .map((r) => r.email?.toLowerCase())
            .filter((v): v is string => Boolean(v)),
        ),
        domains: new Set(
          domainsRows
            .map((r) => r.fingerprint_domain)
            .filter((v): v is string => Boolean(v)),
        ),
      };
    },

    async updateProgress(runId: string, p) {
      // avg_score é calculado na conclusão (média real dos scores),
      // nunca como um percentual de progresso.
      await prisma.prospectionRun.update({
        where: { id: runId },
        data: {
          found_count: p.found,
          saved_count: p.saved,
          duplicate_count: p.duplicates,
          discarded_count: p.discarded,
          error_count: p.errors,
          phone_count: p.extracted,
          email_count: p.qualified,
        },
      });
      // Progresso em tempo real para o browser (canal realtime -> Socket.IO).
      publishRealtime(
        buildProspectingEvent({
          businessId,
          prospectingRunId: runId,
          progress: { ...p, targetQuantity },
        }),
      );
    },

    async persistBatch(runId, businessId, campaignId, leads: QualifiedLead[]) {
      let saved = 0;
      let errors = 0;
      let phones = 0;
      let emails = 0;

      for (const lead of leads) {
        if (lead.phone) phones += 1;
        if (lead.email) emails += 1;
      }

      const created: string[] = [];
      try {
        await prisma.$transaction(async (tx) => {
          for (const lead of leads) {
            const row = await tx.lead.create({
              data: {
                business_id: businessId,
                name: lead.name,
                phone: lead.phone,
                email: lead.email,
                instagram: lead.instagram,
                website: lead.website,
                city: lead.city,
                state: lead.state,
                country: lead.country,
                segment: lead.segment,
                address: lead.address,
                lead_score: lead.leadScore,
                source_url: lead.sourceUrl,
                source_type: "WEB",
                source: "WEB",
                collected_at: new Date(),
                prospection_run_id: runId,
                fingerprint_domain: lead.fingerprintDomain,
                fingerprint_namecity: lead.fingerprintNameCity,
              },
            });
            created.push(row.id);
          }
          if (campaignId && created.length > 0) {
            await tx.campaignLead.createMany({
              data: created.map((leadId) => ({
                campaign_id: campaignId,
                lead_id: leadId,
                business_id: businessId,
              })),
            });
          }
        });
        saved = leads.length;
      } catch (error) {
        errors = leads.length;
        logger.error("Falha ao persistir lote de prospecção", {
          businessId,
          prospectionRunId: runId,
          error: (error as Error).message,
        });
        throw error;
      }

      // Enriquecimento assíncrono (serviço Scrapy): enfileira apenas leads com
      // site próprio. Nunca bloqueia a run — falhas são toleradas no processor.
      const withWebsite = leads
        .map((lead, i) => ({ leadId: created[i], website: lead.website }))
        .filter((x): x is { leadId: string; website: string } =>
          Boolean(x.leadId && x.website),
        );
      if (withWebsite.length > 0) {
        try {
          await getWorkerQueue(QUEUE_NAMES.LEAD_ENRICHMENT).addBulk(
            withWebsite.map(({ leadId, website }) => ({
              name: "enrich",
              data: { leadId, businessId, website },
              opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1000 },
            })),
          );
        } catch (error) {
          logger.warn(
            "Falha ao enfileirar enriquecimento — segue sem quebrar",
            {
              businessId,
              prospectionRunId: runId,
              error: (error as Error).message,
            },
          );
        }
      }

      return { saved, errors, phones, emails };
    },

    async complete(runId, status: ProspectionRunStatus, data) {
      const summary = data.summary
        ? { ...(data.summary as object), error: data.error ?? undefined }
        : { error: data.error ?? undefined };
      await prisma.prospectionRun.update({
        where: { id: runId },
        data: {
          status,
          completed_at: new Date(),
          avg_score: data.avgScore,
          summary: summary as object,
        },
      });
    },
  };
}

/** Consulta o estado atual da run para cancelamento seguro. */
async function isRunCancelled(runId: string): Promise<boolean> {
  const run = await prisma.prospectionRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  return run?.status === "CANCELLED";
}

export async function processProspection(job: {
  id?: string;
  data: ProspectJobData;
}): Promise<void> {
  const { runId, businessId } = job.data;
  const jobId = String(job.id ?? "");
  const started = Date.now();

  prospectorMetrics.record({ type: "start", jobId });

  logger.info("PROSPECTION_STARTED", {
    businessId,
    prospectionRunId: runId,
    jobId,
  });

  // Marca como RUNNING (seguro: CANCELLED é checado pelo orquestrador).
  await prisma.prospectionRun.update({
    where: { id: runId },
    data: { status: "RUNNING", started_at: new Date() },
  });

  // Provider REAL (Firecrawl) ou Overpass (fonte gratuita) conforme config.
  // NUNCA mock em produção: se o mecanismo configurado não estiver disponível,
  // a run falha com erro claro — não fabrica dados.
  let provider;
  let rateLimiter;
  try {
    ({ provider, rateLimiter } = buildDiscoveryProvider({
      businessId,
      segment: job.data.segment,
      country: job.data.country,
      state: job.data.state,
      city: job.data.city,
      targetQuantity: job.data.targetQuantity,
    }));
  } catch (error) {
    if (error instanceof DiscoveryUnavailableError) {
      logger.error("PROSPECTION_FAILED", {
        businessId,
        prospectionRunId: runId,
        jobId,
        reason: "DISCOVERY_NOT_CONFIGURED",
        error: error.message,
      });
      await prisma.prospectionRun
        .update({
          where: { id: runId },
          data: {
            status: "FAILED",
            completed_at: new Date(),
            summary: { error: error.message },
          },
        })
        .catch(() => undefined);
      return; // erro permanente de configuração: não retenta.
    }
    throw error;
  }

  // Normaliza o nicho (ex: "Barbeira" -> "barbearia"), preservando o original
  // no histórico da run.
  const niche = normalizeNiche(job.data.segment);
  const segment = niche.normalized ?? (niche.original || undefined);

  const params: ProspectParams = {
    runId,
    businessId,
    campaignId: job.data.campaignId || undefined,
    segment,
    country: job.data.country || undefined,
    state: job.data.state || undefined,
    city: job.data.city || undefined,
    targetQuantity: Math.min(
      job.data.targetQuantity,
      config.prospector.maxLeadsPerRun,
    ),
    searchTermOriginal: niche.original || undefined,
    normalizedNiche: niche.normalized || undefined,
  };

  try {
    const result = await runProspection(params, {
      provider,
      repository: createProspectionRepository(
        businessId,
        job.data.targetQuantity,
      ),
      config: {
        maxResultsPerSearch: config.prospector.maxResultsPerSearch,
        batchSize: config.prospector.batchSize,
        maxLeadsPerRun: config.prospector.maxLeadsPerRun,
      },
      isCancelled: () => isRunCancelled(runId),
    });

    prospectorMetrics.record({
      type: "complete",
      jobId,
      durationMs: Date.now() - started,
    });
    prospectorMetrics.record({
      type: "found",
      jobId,
      foundDelta: Number(result.summary.found ?? 0),
    });
    prospectorMetrics.record({
      type: "saved",
      jobId,
      savedDelta: Number(result.summary.saved ?? 0),
    });

    logger.info("PROSPECTION_DONE", {
      businessId,
      prospectionRunId: runId,
      jobId,
      status: result.status,
      saved: result.summary.saved,
      duration_ms: Date.now() - started,
    });
  } catch (error) {
    prospectorMetrics.record({ type: "failed", jobId });
    logger.error("PROSPECTION_FAILED", {
      businessId,
      prospectionRunId: runId,
      jobId,
      error: (error as Error).message,
    });
    throw error;
  } finally {
    await provider.close().catch(() => undefined);
    await rateLimiter?.close().catch(() => undefined);
  }
}
