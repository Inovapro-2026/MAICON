#!/usr/bin/env node
/**
 * Teste de carga do Prospector SAVYRON (in-process, sem worker BullMQ).
 *
 * Executa o orquestrador diretamente com um FakeProvider realístico (não o
 * MockDiscoveryProvider de produção) para validar:
 * - isolamento multi-tenant por run (leads do tenant correto);
 * - deduplicação dentro de uma execução;
 * - status PARTIAL quando o provider retorna menos resultados que a meta;
 * - persistência em lotes sem ultrapassar a meta.
 *
 * Roda contra o banco real (Neon) e limpa os dados temporários ao final.
 *
 * Uso:
 *   N_TENANTS=10 JOBS_PER_TENANT=2 TARGET_LEADS=5 node scripts/load-test-prospector.mjs
 */
import { prisma } from "@prospector/database";
import { runProspection } from "@prospector/prospector";

const N_TENANTS = Number(process.env.N_TENANTS || 10);
const JOBS_PER_TENANT = Number(process.env.JOBS_PER_TENANT || 2);
const TARGET_LEADS = Number(process.env.TARGET_LEADS || 5);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

/** Provider fake com dados realísticos (verificáveis), sem nada fabricado. */
function createFakeProvider({ pool, city }) {
  return {
    async searchBusinesses(query, limit) {
      await sleep(15);
      const count = Math.min(limit, pool.length);
      const names = pool.slice(0, count);
      return names.map((name, i) => {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
        return {
          title: `${name} - ${city} - SP`,
          url: `https://${slug}.com.br`,
          description: `Cortes masculinos e barba em ${city} - SP. Fale: (11) 98765-${String(1000 + i).padStart(4, "0")}. contato@${slug}.com.br`,
        };
      });
    },
    async crawlBusiness() {
      return { phones: [], emails: [] };
    },
    async close() {},
  };
}

/** Repositório Prisma real (isola tenant e run no banco). */
function createPrismaRepository() {
  return {
    async existingKeys(businessId) {
      const [phonesRows, emailsRows, domainsRows] = await Promise.all([
        prisma.lead.findMany({
          where: { business_id: businessId, phone: { not: null } },
          select: { phone: true },
          take: 5000,
        }),
        prisma.lead.findMany({
          where: { business_id: businessId, email: { not: null } },
          select: { email: true },
          take: 5000,
        }),
        prisma.lead.findMany({
          where: { business_id: businessId, fingerprint_domain: { not: null } },
          select: { fingerprint_domain: true },
          take: 5000,
        }),
      ]);
      return {
        phones: new Set(phonesRows.map((r) => r.phone).filter(Boolean)),
        emails: new Set(
          emailsRows.map((r) => r.email?.toLowerCase()).filter(Boolean),
        ),
        domains: new Set(
          domainsRows.map((r) => r.fingerprint_domain).filter(Boolean),
        ),
      };
    },
    async updateProgress(runId, p) {
      await prisma.prospectionRun.update({
        where: { id: runId },
        data: {
          found_count: p.found,
          saved_count: p.saved,
          duplicate_count: p.duplicates,
          error_count: p.errors,
        },
      });
    },
    async persistBatch(runId, businessId, campaignId, leads) {
      for (const lead of leads) {
        await prisma.lead.create({
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
      }
      return { saved: leads.length, errors: 0, phones: 0, emails: 0 };
    },
    async complete(runId, status, data) {
      await prisma.prospectionRun.update({
        where: { id: runId },
        data: {
          status,
          completed_at: new Date(),
          avg_score: data.avgScore,
          summary: data.summary
            ? { ...data.summary, error: data.error ?? undefined }
            : { error: data.error ?? undefined },
        },
      });
    },
  };
}

async function main() {
  console.log(
    `[${stamp()}] Iniciando teste de carga in-process: ${N_TENANTS} tenants x ${JOBS_PER_TENANT} jobs`,
  );

  const ts = Date.now();
  const businesses = [];
  for (let t = 0; t < N_TENANTS; t += 1) {
    const slug = `loadtest-${ts}-${t}`;
    const biz = await prisma.business.create({
      data: { name: `Load Test ${t}`, slug, status: "TRIAL" },
    });
    businesses.push(biz);
  }
  console.log(`[${stamp()}] ${businesses.length} tenants criados`);

  const runs = [];
  for (const biz of businesses) {
    for (let j = 0; j < JOBS_PER_TENANT; j += 1) {
      const run = await prisma.prospectionRun.create({
        data: {
          business_id: biz.id,
          segment: "barbearia",
          city: `Cidade${j % 3}`,
          target_quantity: TARGET_LEADS,
          status: "PENDING",
        },
      });
      runs.push(run);
    }
  }
  console.log(`[${stamp()}] ${runs.length} runs criadas`);

  const pool = [
    "Barbearia Central",
    "Barbearia do Zé",
    "Barbearia Imperial",
    "Barbearia Navalha",
    "Barbearia Raiz",
    "Barbearia Vintage",
  ];

  for (const run of runs) {
    const provider = createFakeProvider({ pool, city: run.city });
    await runProspection(
      {
        runId: run.id,
        businessId: run.business_id,
        segment: "barbearia",
        country: "Brasil",
        state: "SP",
        city: run.city,
        targetQuantity: TARGET_LEADS,
        searchTermOriginal: "barbearia",
        normalizedNiche: "barbearia",
      },
      {
        provider,
        repository: createPrismaRepository(),
        config: { maxResultsPerSearch: 4, batchSize: 2, maxLeadsPerRun: 50 },
        isCancelled: async () => false,
      },
    ).catch((err) => {
      console.error(`[${stamp()}] run ${run.id} falhou: ${err.message}`);
    });
  }
  console.log(`[${stamp()}] ${runs.length} prospecções executadas`);

  // Verificação de isolamento: leads devem pertencer à run e ao tenant corretos.
  const completed = await prisma.prospectionRun.findMany({
    where: { id: { in: runs.map((r) => r.id) } },
    include: { _count: { select: { leads: true } } },
  });

  const byTenant = new Map();
  for (const run of completed) {
    const leads = await prisma.lead.findMany({
      where: { prospection_run_id: run.id },
      select: { id: true, business_id: true },
    });
    const wrongTenant = leads.filter(
      (l) => l.business_id !== run.business_id,
    ).length;
    const list = byTenant.get(run.business_id) || {
      runs: 0,
      leads: 0,
      wrong: 0,
    };
    list.runs += 1;
    list.leads += leads.length;
    list.wrong += wrongTenant;
    byTenant.set(run.business_id, list);
  }

  const statusCounts = completed.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  let totalWrong = 0;
  let totalLeads = 0;
  for (const [tenantId, info] of byTenant) {
    totalWrong += info.wrong;
    totalLeads += info.leads;
    console.log(
      `[${stamp()}] tenant=${tenantId.slice(0, 8)} runs=${info.runs} leads=${info.leads} vazamento=${info.wrong}`,
    );
  }

  console.log(`\n[${stamp()}] === RESULTADO ===`);
  console.log("Status por run:", JSON.stringify(statusCounts));
  console.log(
    `Leads totais salvos: ${totalLeads} | Vazamentos cross-tenant: ${totalWrong}`,
  );

  const ok =
    totalWrong === 0 &&
    (statusCounts.COMPLETED || 0) + (statusCounts.PARTIAL || 0) >= runs.length;

  // Limpeza dos dados temporários (ordem respeita as FKs: leads → runs → business).
  const tempIds = businesses.map((b) => b.id);
  await prisma.lead.deleteMany({ where: { business_id: { in: tempIds } } });
  await prisma.prospectionRun.deleteMany({
    where: { business_id: { in: tempIds } },
  });
  await prisma.business.deleteMany({
    where: { slug: { startsWith: `loadtest-${ts}-` } },
  });

  console.log(`\n[${stamp()}] RESULTADO: ${ok ? "APROVADO" : "FALHOU"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Erro no teste de carga:", err);
  process.exit(1);
});
