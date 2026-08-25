/**
 * Processador de PROSPECÇÃO MULTI-PLATAFORMA VIA APIFY (Google Maps + Instagram).
 *
 * Rodando dentro do job BullMQ PROSPECTION (nunca no HTTP). Fluxo:
 *   1. Valida APIFY_API_TOKEN — sem token, a run FALHA com erro visível
 *      (NUNCA contador zerado silenciosamente — lição do incidente Firecrawl).
 *   2. Para cada fonte ativa (google_maps / instagram): executa o actor,
 *      mapeia para leads brutos e extrai contato (e-mail/telefone) da bio
 *      do Instagram via regex.
 *   3. Consolida as fontes (deduplicação entre fontes) e deduplica contra a
 *      base da empresa (telefone/e-mail/domínio/instagram).
 *   4. Persiste leads + vínculo de campanha. Lead sem e-mail/telefone TAMBÉM
 *      é criado (nome + Instagram + segmento já é prospectável) — não bloqueia.
 *   5. Registra uso em `Usage` separado por fonte (custo auditável).
 *   6. Atualiza ProspectionRun (status/progresso/summary com runIds p/ debug).
 *
 * Se UMA fonte falhar (auth/rate limit/actor), o erro é visível: a run é
 * marcada FAILED e o job relança — mesmo que a outra fonte tenha funcionado.
 */
import { config } from "@prospector/config";
import { prisma } from "@prospector/database";
import { createLogger } from "@prospector/logger";
import {
  ApifyActorClient,
  ApifyError,
  ApifySource,
  APIFY_SOURCES,
  buildGoogleMapsInput,
  buildInstagramInput,
  consolidateAcrossSources,
  extractDomain,
  GoogleMapsRecord,
  InstagramRecord,
  mapGoogleMapsRecord,
  mapInstagramRecord,
  normalizePhone,
  ConsolidatedLead,
  RawApifyLead,
} from "@prospector/prospector";
import { publishRealtime, buildProspectingEvent } from "../services/realtime";
import { fingerprintFromDigits } from "../services/leads";

const logger = createLogger("worker.prospect-apify");

export interface ApifyProspectJobData {
  runId: string;
  businessId: string;
  campaignId?: string;
  provider?: "apify";
  sources?: ApifySource[];
  segment?: string;
  country?: string;
  state?: string;
  city?: string;
  targetQuantity: number;
}

const apify = config.prospector.apify;

function monthlyPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

async function recordUsage(
  businessId: string,
  metric: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;
  const period = monthlyPeriod();
  await prisma.usage.upsert({
    where: {
      business_id_metric_period: { business_id: businessId, metric, period },
    },
    create: { business_id: businessId, metric, period, quantity },
    update: { quantity: { increment: quantity } },
  });
}

/** Carrega fingerprints existentes da empresa para deduplicar. */
async function loadExistingFingerprints(businessId: string): Promise<Set<string>> {  const LIMIT = 5000;
  const [phones, emails, domains, instagrams] = await Promise.all([
    prisma.lead.findMany({
      where: { business_id: businessId, fingerprint_phone: { not: null } },
      select: { fingerprint_phone: true },
      take: LIMIT,
    }),
    prisma.lead.findMany({
      where: { business_id: businessId, fingerprint_email: { not: null } },
      select: { fingerprint_email: true },
      take: LIMIT,
    }),
    prisma.lead.findMany({
      where: { business_id: businessId, fingerprint_domain: { not: null } },
      select: { fingerprint_domain: true },
      take: LIMIT,
    }),
    prisma.lead.findMany({
      where: { business_id: businessId, instagram: { not: null } },
      select: { instagram: true },
      take: LIMIT,
    }),
  ]);

  const seen = new Set<string>();
  for (const r of phones) if (r.fingerprint_phone) seen.add(`phone:${r.fingerprint_phone}`);
  for (const r of emails) if (r.fingerprint_email) seen.add(`email:${r.fingerprint_email}`);
  for (const r of domains) if (r.fingerprint_domain) seen.add(`domain:${r.fingerprint_domain}`);
  for (const r of instagrams) {
    if (r.instagram) {
      const u = r.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").toLowerCase();
      if (u) seen.add(`ig:${u}`);
    }
  }
  return seen;
}

/**
 * Limite de volume da run conforme o plano (feature `prospeccao_apify`).
 * Se o plano definir `limit`, ele é o teto por execução; senão usa a config.
 * Nunca permite volume sem teto — custo é controlado por execução.
 */
async function loadPlanCap(businessId: string, configCap: number): Promise<number> {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { business_id: businessId },
      select: { plan_id: true },
    });
    if (subscription?.plan_id) {
      const pf = await prisma.planFeature.findUnique({
        where: {
          plan_id_feature: {
            plan_id: subscription.plan_id,
            feature: "prospeccao_apify",
          },
        },
        select: { limit: true },
      });
      if (pf?.limit && pf.limit > 0) return Math.max(1, Math.min(configCap, pf.limit));
    }
  } catch (error) {
    logger.warn("Falha ao ler limite do plano; usando config", {
      businessId,
      error: (error as Error).message,
    });
  }
  return Math.max(1, configCap);
}

/** Marca a run como FAILED com erro visível. */
async function failRun(runId: string, code: string, message: string): Promise<void> {
  await prisma.prospectionRun
    .update({
      where: { id: runId },
      data: {
        status: "FAILED",
        completed_at: new Date(),
        summary: { error: message, error_code: code },
      },
    })
    .catch(() => undefined);
}

export async function processApifyProspection(job: {
  id?: string;
  data: ApifyProspectJobData;
}): Promise<void> {
  const { runId, businessId, campaignId } = job.data;
  const jobId = String(job.id ?? "");

  // 1) Validação do token — falha VISÍVEL (nunca silenciosa).
  const token = apify.apiToken;
  if (!token) {
    const msg =
      "APIFY_API_TOKEN não configurado. Configure a integração Apify para usar Google Maps/Instagram.";
    logger.error("APIFY_PROSPECTION_FAILED", {
      businessId,
      prospectionRunId: runId,
      jobId,
      reason: "APIFY_TOKEN_MISSING",
    });
    await failRun(runId, "APIFY_TOKEN_MISSING", msg);
    throw new Error(msg);
  }

  const sources = (job.data.sources ?? []).filter((s): s is ApifySource =>
    APIFY_SOURCES.includes(s),
  );
  if (sources.length === 0) {
    const msg =
      "Nenhuma fonte Apify selecionada (google_maps/instagram). Selecione ao menos uma.";
    await failRun(runId, "NO_SOURCES", msg);
    throw new Error(msg);
  }

  logger.info("APIFY_PROSPECTION_STARTED", {
    businessId,
    prospectionRunId: runId,
    jobId,
    sources,
  });

  await prisma.prospectionRun.update({
    where: { id: runId },
    data: { status: "RUNNING", started_at: new Date() },
  });

  const segment = job.data.segment;
  const locationQuery = [job.data.city, job.data.state, job.data.country]
    .filter(Boolean)
    .join(", ");
  const searchStrings = segment ? [segment] : [job.data.city ?? "negócios"];
  // Teto da run = menor entre a meta do usuário, a config e o limite do plano.
  const placesCap = await loadPlanCap(businessId, apify.maxCrawledPlacesPerSearch);
  const maxQuantity = Math.max(
    1,
    Math.min(job.data.targetQuantity, placesCap * 5),
  );

  const seen = await loadExistingFingerprints(businessId);
  const allRaw: RawApifyLead[] = [];
  const usage: { source: ApifySource; count: number }[] = [];
  const runRefs: { source: ApifySource; actorRunId: string; datasetId: string }[] = [];

  // 2) Executa cada fonte. Falha de QUALQUER fonte = run FAILED visível.
  for (const source of sources) {
    try {
      if (source === "google_maps") {
        const client = new ApifyActorClient({
          apiToken: token,
          actorId: apify.actorGoogleMaps,
          requestTimeoutMs: apify.requestTimeoutMs,
          pollIntervalMs: apify.pollIntervalMs,
        });
        const input = buildGoogleMapsInput({
          searchStringsArray: searchStrings,
          locationQuery: locationQuery || undefined,
          maxCrawledPlacesPerSearch: apify.maxCrawledPlacesPerSearch,
        });
        const { items, actorRunId, datasetId } =
          await client.run<GoogleMapsRecord>(input);
        const mapped = items
          .map(mapGoogleMapsRecord)
          .filter((r): r is RawApifyLead => Boolean(r));
        allRaw.push(...mapped);
        usage.push({ source, count: mapped.length });
        runRefs.push({ source, actorRunId, datasetId });
        logger.info("APIFY_SOURCE_OK", {
          businessId,
          source,
          items: mapped.length,
          runId: actorRunId,
        });
      } else {
        // Instagram: busca por local (place) E por perfil (user).
        const client = new ApifyActorClient({
          apiToken: token,
          actorId: apify.actorInstagram,
          requestTimeoutMs: apify.requestTimeoutMs,
          pollIntervalMs: apify.pollIntervalMs,
        });
        const place = await client.run<InstagramRecord>(
          buildInstagramInput({
            searchStringsArray: searchStrings,
            locationQuery: locationQuery || undefined,
            searchType: "place",
            maxProfiles: apify.maxInstagramProfiles,
          }),
        );
        const user = await client.run<InstagramRecord>(
          buildInstagramInput({
            searchStringsArray: searchStrings,
            locationQuery: locationQuery || undefined,
            searchType: "user",
            maxProfiles: apify.maxInstagramProfiles,
          }),
        );
        const mapped = [...place.items, ...user.items]
          .map(mapInstagramRecord)
          .filter((r): r is RawApifyLead => Boolean(r));
        allRaw.push(...mapped);
        usage.push({ source, count: mapped.length });
        runRefs.push(
          { source, actorRunId: place.actorRunId, datasetId: place.datasetId },
          { source, actorRunId: user.actorRunId, datasetId: user.datasetId },
        );
        logger.info("APIFY_SOURCE_OK", {
          businessId,
          source,
          items: mapped.length,
          runIds: [place.actorRunId, user.actorRunId],
        });
      }
    } catch (error) {
      const message =
        error instanceof ApifyError ? error.message : (error as Error).message;
      logger.error("APIFY_SOURCE_FAILED", {
        businessId,
        prospectionRunId: runId,
        jobId,
        source,
        error: message,
      });
      // Regra de falha visível: UMA fonte quebrar derruba a run inteira.
      await failRun(runId, "APIFY_SOURCE_FAILED", `${source}: ${message}`);
      throw error;
    }
  }

  // 3) Consolida entre fontes + deduplica contra a base.
  const consolidated = consolidateAcrossSources(allRaw);
  const leadsToCreate: ConsolidatedLead[] = [];
  let duplicates = 0;

  for (const lead of consolidated) {
    const phone = normalizePhone(lead.phone ?? "");
    const email = lead.email?.toLowerCase().trim();
    const domain = lead.website ? extractDomain(lead.website) : undefined;
    const ig = lead.instagramUsername?.toLowerCase();

    const keys: string[] = [];
    if (phone) keys.push(`phone:${fingerprintFromDigits(phone)}`);
    if (email) keys.push(`email:${email}`);
    if (domain) keys.push(`domain:${domain}`);
    if (ig) keys.push(`ig:${ig}`);

    if (keys.some((k) => seen.has(k))) {
      duplicates += 1;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    leadsToCreate.push(lead);
  }

  // 4) Persiste (lead sem contato também é criado — não bloqueia).
  let saved = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const lead of leadsToCreate.slice(0, maxQuantity)) {
        const phoneFp = lead.phone
          ? fingerprintFromDigits(normalizePhone(lead.phone) ?? lead.phone)
          : null;
        const emailFp = lead.email?.toLowerCase().trim() || null;
        const domainFp = lead.website ? extractDomain(lead.website) : undefined;

        const data = {
          business_id: businessId,
          name: lead.name,
          phone: lead.phone ? normalizePhone(lead.phone) ?? lead.phone : null,
          email: lead.email,
          instagram: lead.instagram,
          website: lead.website,
          segment: lead.segment,
          address: lead.address,
          city: lead.city,
          source_url: lead.sourceUrl,
          source_type: lead.sources?.join("+") ?? lead.source,
          source: "WEB" as const,
          collected_at: new Date(),
          prospection_run_id: runId,
          fingerprint_phone: phoneFp,
          fingerprint_email: emailFp,
          fingerprint_domain: domainFp,
          fingerprint_namecity: `${lead.name}|${lead.city ?? ""}`,
        };

        let row;
        if (phoneFp) {
          row = await tx.lead.upsert({
            where: {
              business_id_fingerprint_phone: {
                business_id: businessId,
                fingerprint_phone: phoneFp,
              },
            },
            create: data,
            update: {},
          });
        } else if (emailFp) {
          row = await tx.lead.upsert({
            where: {
              business_id_fingerprint_email: {
                business_id: businessId,
                fingerprint_email: emailFp,
              },
            },
            create: data,
            update: {},
          });
        } else {
          row = await tx.lead.create({ data });
        }

        if (campaignId) {
          await tx.campaignLead.createMany({
            data: [{ campaign_id: campaignId, lead_id: row.id, business_id: businessId }],
          });
        }
      }
    });
    saved = Math.min(leadsToCreate.length, maxQuantity);
  } catch (error) {
    const message = (error as Error).message;
    logger.error("APIFY_PERSIST_FAILED", {
      businessId,
      prospectionRunId: runId,
      jobId,
      error: message,
    });
    await failRun(runId, "PERSIST_FAILED", message);
    throw error;
  }

  // 5) Registra uso por fonte (custo auditável).
  for (const u of usage) {
    await recordUsage(businessId, `apify_${u.source}`, u.count);
  }

  // 6) Conclui a run.
  const status = saved >= maxQuantity ? "COMPLETED" : saved > 0 ? "PARTIAL" : "FAILED";
  const summary = {
    sources,
    found: allRaw.length,
    saved,
    duplicates,
    usage,
    apify_run_ids: runRefs,
  };
  await prisma.prospectionRun.update({
    where: { id: runId },
    data: {
      status,
      completed_at: new Date(),
      found_count: allRaw.length,
      saved_count: saved,
      duplicate_count: duplicates,
      summary,
    },
  });

  publishRealtime(
    buildProspectingEvent({
      businessId,
      prospectingRunId: runId,
      progress: {
        searched: sources.length,
        found: allRaw.length,
        crawled: allRaw.length,
        extracted: allRaw.length,
        duplicates,
        qualified: saved,
        saved,
        errors: 0,
      },
    }),
  );

  logger.info("APIFY_PROSPECTION_DONE", {
    businessId,
    prospectionRunId: runId,
    jobId,
    status,
    sources,
    found: allRaw.length,
    saved,
    duplicates,
  });
}
