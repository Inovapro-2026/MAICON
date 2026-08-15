import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSearchQueries,
  extractEmails,
  extractInstagram,
  extractPhones,
  nameCityFingerprint,
  normalizeDomain,
  normalizeState,
  scoreLead,
  classifyScore,
  validateCandidate,
  ProspectionDeduplicator,
  runProspection,
  MockDiscoveryProvider,
} from "@prospector/prospector";
import {
  createFakeProvider,
  fakeResult,
  fakeRepository,
} from "./helpers/fake-discovery-provider.mjs";

// ----------------------------- query-builder -----------------------------
test("query-builder monta queries com segmento e região", () => {
  const queries = buildSearchQueries({
    segment: "barbearia",
    city: "São Paulo",
    state: "SP",
    targetQuantity: 50,
  });
  assert.ok(queries.length >= 1);
  assert.match(queries[0].query, /São Paulo/i);
  assert.match(queries[0].query, /barbearia/i);
});

test("query-builder limita o número de queries pela meta", () => {
  const small = buildSearchQueries({
    segment: "salao",
    city: "Campinas",
    targetQuantity: 5,
  });
  assert.ok(small.length <= 3);
});

// ----------------------------- normalizer -----------------------------
test("normalizeDomain remove subdomínios", () => {
  assert.equal(
    normalizeDomain("https://www.barbeariajoao.com.br/contato"),
    "barbeariajoao.com.br",
  );
  assert.equal(normalizeDomain("https://loja.maria.com.br"), "maria.com.br");
  assert.equal(normalizeDomain("not-a-url"), null);
});

test("normalizeState converte nome em UF", () => {
  assert.equal(normalizeState("SP"), "SP");
  assert.equal(normalizeState("são paulo"), "SA");
  assert.equal(normalizeState(null), null);
});

test("extractPhones extrai telefones E.164", () => {
  const phones = extractPhones("Fale: (11) 98765-4321 ou 11 8765-4321");
  assert.ok(phones.includes("+5511987654321"));
});

test("extractEmails normaliza e ignora placeholders/fabricados", () => {
  const emails = extractEmails(
    "email: Contato@Barbearia.com.br, contato@seusite.com e foo@exemplo.com.br",
  );
  assert.ok(emails.includes("contato@barbearia.com.br"));
  assert.ok(!emails.includes("contato@seusite.com"));
  assert.ok(!emails.includes("foo@exemplo.com.br"));
});

test("extractInstagram captura handle", () => {
  assert.equal(
    extractInstagram("Siga @barbeariaimperial no instagram"),
    "barbeariaimperial",
  );
  assert.equal(extractInstagram("sem rede social aqui"), undefined);
});

test("nameCityFingerprint normaliza acentos", () => {
  assert.equal(
    nameCityFingerprint("Barbearia do João", "São Paulo"),
    "barbeariadojoao|saopaulo",
  );
});

// ----------------------------- validator -----------------------------
test("validador rejeita páginas genéricas", () => {
  assert.equal(
    validateCandidate({ name: "Resultados", title: "Resultados da busca" })
      .valid,
    false,
  );
  assert.equal(
    validateCandidate({
      name: "Google",
      title: "Google",
      description: "portal",
    }).valid,
    false,
  );
});

test("validador aceita negócio com localização", () => {
  const result = validateCandidate({
    name: "Barbearia do João",
    title: "Barbearia do João - Home",
    city: "São Paulo",
    state: "SP",
  });
  assert.equal(result.valid, true);
});

test("validador rejeita sem localização e sem contato", () => {
  const result = validateCandidate({ name: "Studio X", title: "Studio X" });
  assert.equal(result.valid, false);
});

// ----------------------------- scoring -----------------------------
test("scoring pontua contatos e localização", () => {
  const high = scoreLead({
    phone: "+5511",
    email: "a@b.com",
    website: "x.com",
    city: "SP",
    segment: "barbearia",
  });
  const low = scoreLead({});
  assert.ok(high > low);
  assert.equal(high, 92);
  assert.equal(low, 20);
  assert.equal(classifyScore(80), "Alto");
  assert.equal(classifyScore(50), "Médio");
  assert.equal(classifyScore(20), "Baixo");
});

// ----------------------------- deduplicator -----------------------------
test("deduplicator detecta telefone duplicado", () => {
  const d = new ProspectionDeduplicator({
    phones: new Set(),
    emails: new Set(),
    domains: new Set(),
  });
  const first = d.check({ name: "A", phone: "+5511987654321" });
  const second = d.check({ name: "B", phone: "+5511987654321" });
  assert.equal(first.status, "NEW");
  assert.equal(second.status, "DUPLICATE");
});

test("deduplicator usa base existente", () => {
  const d = new ProspectionDeduplicator({
    phones: new Set(["+5511987654321"]),
    emails: new Set(),
    domains: new Set(),
  });
  const result = d.check({ name: "A", phone: "+5511987654321" });
  assert.equal(result.status, "DUPLICATE");
});

// ----------------------------- orchestrator -----------------------------
function barbershopResults(count) {
  return Array.from({ length: count }, (_, i) =>
    fakeResult({
      title: `Barbearia ${["Central", "Imperial", "do Zé", "Navalha", "Raiz", "Vintage"][i % 6]} - São Paulo - SP`,
      url: `https://barbearia${i}.com.br`,
      description: `Cortes masculinos e barba em São Paulo - SP. Fale: (11) 98765-${String(1000 + i).padStart(4, "0")}. contato@barbearia${i}.com.br`,
    }),
  );
}

test("orquestrador completa e isola businessId", async () => {
  const repo = fakeRepository();
  const provider = createFakeProvider({ results: barbershopResults(5) });
  const result = await runProspection(
    {
      runId: "run-a",
      businessId: "biz-1",
      segment: "barbearia",
      state: "SP",
      city: "São Paulo",
      targetQuantity: 5,
    },
    {
      provider,
      repository: repo,
      config: { maxResultsPerSearch: 5, batchSize: 3, maxLeadsPerRun: 50 },
      isCancelled: async () => false,
    },
  );
  assert.equal(result.status, "COMPLETED");
  assert.ok(repo.state.completed.runId === "run-a");
  assert.ok(repo.state.persisted.length >= 1);
  for (const batch of repo.state.persisted) {
    assert.equal(batch.businessId, "biz-1");
    assert.equal(batch.campaignId, null);
  }
  assert.ok(repo.state.completed.data.summary.saved >= 1);
});

test("orquestrador respeita meta máxima de leads", async () => {
  const repo = fakeRepository();
  const provider = createFakeProvider({ results: barbershopResults(6) });
  await runProspection(
    {
      runId: "run-b",
      businessId: "biz-2",
      segment: "barbearia",
      state: "SP",
      city: "São Paulo",
      targetQuantity: 3,
    },
    {
      provider,
      repository: repo,
      config: { maxResultsPerSearch: 5, batchSize: 10, maxLeadsPerRun: 50 },
      isCancelled: async () => false,
    },
  );
  assert.equal(repo.state.completed.data.summary.saved, 3);
});

test("orquestrador cancela ao detectar cancelamento", async () => {
  const repo = fakeRepository();
  const provider = createFakeProvider({ results: barbershopResults(5) });
  const result = await runProspection(
    {
      runId: "run-c",
      businessId: "biz-3",
      segment: "barbearia",
      targetQuantity: 10,
    },
    {
      provider,
      repository: repo,
      config: { maxResultsPerSearch: 5, batchSize: 3, maxLeadsPerRun: 50 },
      isCancelled: async () => true,
    },
  );
  assert.equal(result.status, "CANCELLED");
  assert.equal(repo.state.completed.status, "CANCELLED");
});

test("orquestrador conta duplicados dentro da execução", async () => {
  const repo = fakeRepository();
  const dup = barbershopResults(1)[0];
  const provider = createFakeProvider({
    results: [dup, { ...dup, title: "Barbearia Central 2 - São Paulo - SP" }],
  });
  const result = await runProspection(
    {
      runId: "run-d",
      businessId: "biz-4",
      segment: "barbearia",
      state: "SP",
      city: "São Paulo",
      targetQuantity: 20,
    },
    {
      provider,
      repository: repo,
      config: { maxResultsPerSearch: 5, batchSize: 5, maxLeadsPerRun: 50 },
      isCancelled: async () => false,
    },
  );
  const summary = repo.state.completed.data.summary;
  assert.ok(["COMPLETED", "PARTIAL"].includes(result.status));
  assert.ok(summary.duplicates >= 1);
  assert.ok(summary.saved <= summary.qualified);
});

test("MockDiscoveryProvider gera dados que são rejeitados (nada fabricado é salvo)", async () => {
  const repo = fakeRepository();
  const provider = new MockDiscoveryProvider();
  const result = await runProspection(
    {
      runId: "run-e",
      businessId: "biz-5",
      segment: "barbearia",
      state: "SP",
      city: "São Paulo",
      targetQuantity: 5,
    },
    {
      provider,
      repository: repo,
      config: { maxResultsPerSearch: 5, batchSize: 3, maxLeadsPerRun: 50 },
      isCancelled: async () => false,
    },
  );
  assert.equal(repo.state.persisted.length, 0);
  assert.equal(result.status, "PARTIAL");
});
