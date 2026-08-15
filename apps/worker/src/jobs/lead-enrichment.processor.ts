/**
 * Processador da fila LEAD_ENRICHMENT.
 * Consome leads com site (prospecção) e chama o serviço Scrapy para enriquecer
 * com e-mail/telefone/instagram/facebook/whatsapp adicionais.
 *
 * Tolera falhas: site fora do ar, timeout ou serviço indisponível NUNCA
 * derrubam o job — apenas registram e seguem.
 */
import { config } from "@prospector/config";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import { buildEnrichmentPatch, fetchEnrichment } from "../services/enrichment";

const logger = createLogger("worker.lead-enrichment");

export interface LeadEnrichmentJobData {
  leadId: string;
  businessId: string;
  website: string;
}

export async function processLeadEnrichment(job: {
  id?: string;
  data: LeadEnrichmentJobData;
}): Promise<void> {
  const { leadId, businessId, website } = job.data;
  const jobId = String(job.id ?? "");

  if (!website || !/^https?:\/\//i.test(website)) return;

  try {
    const result = await fetchEnrichment(
      website,
      config.prospector.scrapyServiceUrl,
      config.prospector.jobTimeoutMs,
    );

    if (!result || !result.data) {
      logger.debug("Enriquecimento sem dados", {
        leadId,
        businessId,
        jobId,
        website,
      });
      return;
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, business_id: businessId },
      select: { id: true, email: true, phone: true },
    });
    if (!lead) return;

    const patch = buildEnrichmentPatch(lead, result.data);
    if (Object.keys(patch).length === 0) return;

    await prisma.lead.update({
      where: { id: leadId },
      data: patch,
    });
    logger.info("LEAD_ENRICHED", {
      leadId,
      businessId,
      jobId,
      website,
      fields: Object.keys(patch),
    });
  } catch (error) {
    logger.warn("Enriquecimento falhou — segue sem quebrar", {
      leadId,
      businessId,
      jobId,
      website,
      error: (error as Error).message,
    });
  }
}
