/**
 * Testes da camada de integridade anti-dados-fabricados.
 *
 * Garante que a prospecção NUNCA persiste dados fictícios:
 * - origem verificável (source_url real, domínio não-fabricado);
 * - e-mail/telefone válidos e reais;
 * - relevância de nicho e coerência de localização;
 * - sem fallback para mock quando o Firecrawl não está configurado.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  FABRICATED_DOMAIN_RE,
  extractLocationFromText,
  normalizeNiche,
  validateDiscoveredLead,
  runProspection,
  buildDiscoveryProvider,
  DiscoveryUnavailableError,
  PROSPECTION_DISCOVERY_UNAVAILABLE,
  MockDiscoveryProvider,
} from "@prospector/prospector";
import { config } from "@prospector/config";
import {
  createFakeProvider,
  fakeResult,
  fakeRepository,
} from "./helpers/fake-discovery-provider.mjs";

const RUN_OPTS = {
  config: { maxResultsPerSearch: 10, batchSize: 10, maxLeadsPerRun: 500 },
  isCancelled: async () => false,
};

function sp(params, extra = {}) {
  return {
    runId: "run-x",
    businessId: "biz-x",
    segment: "barbearia",
    country: "Brasil",
    state: "SP",
    city: "São Paulo",
    targetQuantity: 5,
    ...params,
    ...extra,
  };
}

// ----------------------------- unitários -----------------------------
test("normalizeNiche corrige erro de digitação e preserva o original", () => {
  const barbeira = normalizeNiche("Barbeira");
  assert.equal(barbeira.normalized, "barbearia");
  assert.equal(barbeira.original, "Barbeira");
  const novo = normalizeNiche("pet shop");
  assert.equal(novo.normalized, null);
  assert.equal(novo.original, "pet shop");
});

test("extractLocationFromText encontra 'Cidade - UF'", () => {
  const ev = extractLocationFromText(
    "Barbearia Imperial - Campinas - SP - home",
  );
  assert.equal(ev.city, "Campinas");
  assert.equal(ev.state, "SP");
  assert.equal(extractLocationFromText("Barbearia Imperial em Campinas"), null);
});

test("FABRICATED_DOMAIN_RE detecta domínios de template", () => {
  for (const url of [
    "https://barbearia.exemplo.com.br",
    "http://x.example.com",
    "https://site.test",
    "http://localhost:3000",
    "https://seudominio.com.br",
    "https://dominio.com",
  ]) {
    assert.ok(FABRICATED_DOMAIN_RE.test(url), url);
  }
  assert.ok(!FABRICATED_DOMAIN_RE.test("https://barbeariacentral.com.br"));
});

test("validateDiscoveredLead rejeita sem source_url", () => {
  const res = validateDiscoveredLead(
    { name: "Barbearia X", sourceUrl: null, city: "São Paulo", state: "SP" },
    { segment: "barbearia", city: "São Paulo", state: "SP" },
  );
  assert.equal(res.reason, "NO_SOURCE_URL");
});

test("validateDiscoveredLead rejeita domínio fabricado", () => {
  const res = validateDiscoveredLead(
    {
      name: "Barbearia X",
      sourceUrl: "https://barbeariax.exemplo.com.br",
      city: "São Paulo",
      state: "SP",
    },
    { segment: "barbearia", city: "São Paulo", state: "SP" },
  );
  assert.equal(res.reason, "FABRICATED_DOMAIN");
});

test("validateDiscoveredLead rejeita e-mail de domínio fabricado", () => {
  const res = validateDiscoveredLead(
    {
      name: "Barbearia X",
      sourceUrl: "https://barbeariax.com.br",
      email: "contato@seudominio.com",
      city: "São Paulo",
      state: "SP",
    },
    { segment: "barbearia" },
  );
  assert.equal(res.reason, "FABRICATED_EMAIL");
});

test("validateDiscoveredLead rejeita telefone inválido", () => {
  const res = validateDiscoveredLead(
    {
      name: "Barbearia X",
      sourceUrl: "https://barbeariax.com.br",
      phone: "0000000000",
      city: "São Paulo",
      state: "SP",
    },
    { segment: "barbearia" },
  );
  assert.equal(res.reason, "INVALID_PHONE");
});

test("validateDiscoveredLead rejeita nicho conflitante (academia x barbearia)", () => {
  const res = validateDiscoveredLead(
    {
      name: "Academia Corpo em Forma",
      sourceUrl: "https://academiacorpo.com.br",
      description: "Musculação e treino funcional",
      city: "São Paulo",
      state: "SP",
    },
    { segment: "barbearia", city: "São Paulo", state: "SP" },
  );
  assert.equal(res.reason, "NICHE_MISMATCH");
});

test("validateDiscoveredLead rejeita cidade divergente", () => {
  const res = validateDiscoveredLead(
    {
      name: "Barbearia Imperial",
      sourceUrl: "https://barbeariaimperial.com.br",
      city: "Campinas",
      state: "SP",
    },
    { segment: "barbearia", city: "São Paulo", state: "SP" },
  );
  assert.equal(res.reason, "LOCATION_MISMATCH");
});

test("validateDiscoveredLead aceita lead real e coerente", () => {
  const res = validateDiscoveredLead(
    {
      name: "Barbearia Imperial",
      sourceUrl: "https://barbeariaimperial.com.br",
      description: "Cortes masculinos e barba em São Paulo",
      phone: "(11) 98765-4321",
      email: "contato@barbeariaimperial.com.br",
      city: "São Paulo",
      state: "SP",
    },
    { segment: "barbearia", city: "São Paulo", state: "SP" },
  );
  assert.equal(res.valid, true);
});

// ----------------------------- cenários do fluxo -----------------------------
test("1. provider real com 10 resultados salva até a meta, todos reais", async () => {
  const repo = fakeRepository();
  const results = Array.from({ length: 10 }, (_, i) =>
    fakeResult({
      title: `Barbearia ${i} - São Paulo - SP`,
      url: `https://barbearia${i}.com.br`,
      description: `Cortes em São Paulo - SP. (11) 98765-${String(1000 + i).padStart(4, "0")}. contato@barbearia${i}.com.br`,
    }),
  );
  await runProspection(sp({ targetQuantity: 10 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results }),
    repository: repo,
  });
  const saved = repo.state.persisted.flatMap((b) => b.leads);
  assert.equal(saved.length, 10);
  for (const lead of saved) {
    assert.ok(!FABRICATED_DOMAIN_RE.test(lead.sourceUrl ?? ""));
    assert.ok(lead.phone, "lead sem telefone válido");
    assert.ok(lead.email, "lead sem e-mail válido");
  }
});

test("2. provider retorna 0 resultados -> PARTIAL com 0 leads (nada fabricado)", async () => {
  const repo = fakeRepository();
  const result = await runProspection(sp({}), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [] }),
    repository: repo,
  });
  assert.equal(result.status, "PARTIAL");
  assert.equal(repo.state.persisted.flatMap((b) => b.leads).length, 0);
});

test("3. meta de 50 com provider de 5 -> PARTIAL, nunca cria 50", async () => {
  const repo = fakeRepository();
  const results = Array.from({ length: 5 }, (_, i) =>
    fakeResult({
      title: `Barbearia ${i} - São Paulo - SP`,
      url: `https://barbearia${i}.com.br`,
      description: `Cortes em São Paulo - SP. (11) 98765-${String(1000 + i).padStart(4, "0")}. contato@barbearia${i}.com.br`,
    }),
  );
  const result = await runProspection(sp({ targetQuantity: 50 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results }),
    repository: repo,
  });
  const saved = repo.state.persisted.flatMap((b) => b.leads);
  assert.equal(result.status, "PARTIAL");
  assert.equal(saved.length, 5);
  assert.ok(saved.length < 50);
});

test("4. resultado sem source_url é rejeitado", async () => {
  const repo = fakeRepository();
  const noSource = fakeResult({
    title: "Barbearia Fantasma - São Paulo - SP",
    url: "",
    description: "Sem site. Cortes em São Paulo - SP.",
  });
  await runProspection(sp({}), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [noSource] }),
    repository: repo,
  });
  assert.equal(repo.state.persisted.flatMap((b) => b.leads).length, 0);
});

test("5. e-mail fictício extraído no crawl é rejeitado", async () => {
  const repo = fakeRepository();
  // Candidato SEM contato no snippet: força o crawl a rodar e retornar
  // um e-mail fabricado, que deve ser rejeitado.
  const provider = createFakeProvider({
    results: [
      fakeResult({
        title: "Barbearia Z - São Paulo - SP",
        url: "https://barbeariaz.com.br",
        description: "Cortes em São Paulo - SP.",
      }),
    ],
    crawl: () => ({ phones: [], emails: ["contato@seudominio.com"] }),
  });
  await runProspection(sp({}), { ...RUN_OPTS, provider, repository: repo });
  assert.equal(repo.state.persisted.flatMap((b) => b.leads).length, 0);
});

test("6. telefone inválido extraído no crawl é rejeitado", async () => {
  const repo = fakeRepository();
  const provider = createFakeProvider({
    results: [
      fakeResult({
        title: "Barbearia W - São Paulo - SP",
        url: "https://barbeariaw.com.br",
        description: "Cortes em São Paulo - SP.",
      }),
    ],
    crawl: () => ({ phones: ["0000000000"], emails: [] }),
  });
  await runProspection(sp({}), { ...RUN_OPTS, provider, repository: repo });
  assert.equal(repo.state.persisted.flatMap((b) => b.leads).length, 0);
});

test("7. academia não entra em prospecção de barbearia", async () => {
  const repo = fakeRepository();
  const gym = fakeResult({
    title: "Academia Corpo em Forma - São Paulo - SP",
    url: "https://academiacorpo.com.br",
    description:
      "Musculação, personal trainer e aulas em São Paulo - SP. (11) 98765-9000. contato@academiacorpo.com.br",
  });
  await runProspection(sp({}), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [gym] }),
    repository: repo,
  });
  assert.equal(repo.state.persisted.flatMap((b) => b.leads).length, 0);
});

test("8. lead de outra cidade é rejeitado", async () => {
  const repo = fakeRepository();
  const campinas = fakeResult({
    title: "Barbearia Imperial - Campinas - SP",
    url: "https://barbeariaimperial.com.br",
    description:
      "Cortes em Campinas - SP. (11) 98765-1111. contato@barbeariaimperial.com.br",
  });
  await runProspection(sp({}), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [campinas] }),
    repository: repo,
  });
  assert.equal(repo.state.persisted.flatMap((b) => b.leads).length, 0);
});

test("9. provider com erro -> FAILED, sem mock e sem fabricação", async () => {
  const repo = fakeRepository();
  const provider = createFakeProvider({ results: [] });
  provider.searchBusinesses = async () => {
    throw new Error("Firecrawl rate limited");
  };
  await assert.rejects(
    runProspection(sp({}), {
      ...RUN_OPTS,
      provider,
      repository: repo,
    }),
    /Firecrawl rate limited/,
  );
  assert.equal(repo.state.completed.status, "FAILED");
  assert.equal(repo.state.persisted.flatMap((b) => b.leads).length, 0);
  const errors = repo.state.completed.data.summary.errors;
  assert.ok(Array.isArray(errors) && errors.length >= 1);
  assert.match(errors[0], /Firecrawl rate limited/);
});

test("10. buildDiscoveryProvider nunca usa mock; sem chave há fallback Overpass (modo auto)", async () => {
  assert.match(PROSPECTION_DISCOVERY_UNAVAILABLE, /não configurado/i);
  const err = new DiscoveryUnavailableError();
  assert.ok(err instanceof Error);
  assert.match(err.message, /não configurado/i);

  const built = buildDiscoveryProvider({
    businessId: "biz-test",
    segment: "barbearia",
    state: "SP",
    city: "São Paulo",
    targetQuantity: 5,
  });
  try {
    assert.ok(built.provider);
    assert.ok(!(built.provider instanceof MockDiscoveryProvider));
  } finally {
    await built.rateLimiter?.close().catch(() => undefined);
  }
});

test("11. mistura de reais e fabricados -> só reais salvos", async () => {
  const repo = fakeRepository();
  const real1 = fakeResult({
    title: "Barbearia Central - São Paulo - SP",
    url: "https://barbeariacentral.com.br",
    description:
      "Cortes em São Paulo - SP. (11) 98765-1001. contato@barbeariacentral.com.br",
  });
  const real2 = fakeResult({
    title: "Barbearia Imperial - São Paulo - SP",
    url: "https://barbeariaimperial.com.br",
    description:
      "Cortes em São Paulo - SP. (11) 98765-1002. contato@barbeariaimperial.com.br",
  });
  const fake = fakeResult({
    title: "Barbearia do João - São Paulo - SP",
    url: "https://barbeariajoao.exemplo.com.br",
    description:
      "Cortes em São Paulo - SP. (11) 98765-1003. contato@barbeariajoao.exemplo.com.br",
  });
  const real3 = fakeResult({
    title: "Barbearia Navalha - São Paulo - SP",
    url: "https://barbearianavalha.com.br",
    description:
      "Cortes em São Paulo - SP. (11) 98765-1004. contato@barbearianavalha.com.br",
  });
  await runProspection(sp({ targetQuantity: 3 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [real1, fake, real2, real3] }),
    repository: repo,
  });
  const saved = repo.state.persisted.flatMap((b) => b.leads);
  assert.equal(saved.length, 3);
  for (const lead of saved) {
    assert.ok(!FABRICATED_DOMAIN_RE.test(lead.sourceUrl ?? ""));
  }
});

test("12. parcial persiste apenas leads reais", async () => {
  const repo = fakeRepository();
  const real = fakeResult({
    title: "Barbearia Raiz - São Paulo - SP",
    url: "https://barbeariaraiz.com.br",
    description:
      "Cortes em São Paulo - SP. (11) 98765-2001. contato@barbeariaraiz.com.br",
  });
  const fake = fakeResult({
    title: "Barbearia Fake - São Paulo - SP",
    url: "https://fake.example.com",
    description: "Cortes em São Paulo - SP.",
  });
  await runProspection(sp({ targetQuantity: 50 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [real, fake] }),
    repository: repo,
  });
  const saved = repo.state.persisted.flatMap((b) => b.leads);
  assert.equal(saved.length, 1);
  assert.ok(!FABRICATED_DOMAIN_RE.test(saved[0].sourceUrl ?? ""));
});

test("13. scores não são todos 95 (variam com os sinais reais)", async () => {
  const repo = fakeRepository();
  const full = fakeResult({
    title: "Barbearia Completa - São Paulo - SP",
    url: "https://barbeariacompleta.com.br",
    description:
      "Cortes em São Paulo - SP. (11) 98765-3001. contato@barbeariacompleta.com.br",
  });
  const partial = fakeResult({
    title: "Barbearia Enxuta - São Paulo - SP",
    url: "https://barbeariaenxuta.com.br",
    description: "Cortes e barba em São Paulo - SP. (11) 98765-3002.",
  });
  await runProspection(sp({ targetQuantity: 2 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [full, partial] }),
    repository: repo,
  });
  const saved = repo.state.persisted.flatMap((b) => b.leads);
  assert.equal(saved.length, 2);
  const scores = saved.map((l) => l.leadScore);
  assert.ok(
    scores.some((s) => s !== 95),
    `scores todos 95? ${scores}`,
  );
  assert.ok(repo.state.completed.data.avgScore !== 95 || saved.length === 1);
});

test("17. lead sem telefone e sem e-mail é ignorado (NO_CONTACT) e contado como descartado", async () => {
  const repo = fakeRepository();
  const noContact = fakeResult({
    title: "Barbearia Fantasma - São Paulo - SP",
    url: "https://barbeariafantasma.com.br",
    description: "Cortes e barba em São Paulo - SP.",
  });
  await runProspection(sp({ targetQuantity: 5 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [noContact] }),
    repository: repo,
  });
  // Nenhum lead sem contato é salvo.
  assert.equal(repo.state.persisted.flatMap((b) => b.leads).length, 0);
  // A run NÃO finaliza como COMPLETED com zero (termina PARTIAL).
  assert.equal(repo.state.completed.status, "PARTIAL");
  // Os itens sem contato são contabilizados separadamente (transparência).
  const summary = repo.state.completed.data.summary;
  assert.ok(summary.discarded >= 1, `discarded deveria >= 1 (${summary.discarded})`);
  assert.ok(summary.found >= 1, "encontrados brutos refletem a fonte");
});

test("14. nenhum lead com domínio .exemplo.com.br é persistido", async () => {
  const repo = fakeRepository();
  const good = Array.from({ length: 3 }, (_, i) =>
    fakeResult({
      title: `Barbearia ${i} - São Paulo - SP`,
      url: `https://barbearia${i}.com.br`,
      description: `Cortes em São Paulo - SP. (11) 98765-${String(4000 + i).padStart(4, "0")}. contato@barbearia${i}.com.br`,
    }),
  );
  const bad = fakeResult({
    title: "Barbearia Exemplo - São Paulo - SP",
    url: "https://barbeariaexemplo.exemplo.com.br",
    description:
      "Cortes em São Paulo - SP. (11) 98765-4009. contato@barbeariaexemplo.exemplo.com.br",
  });
  await runProspection(sp({ targetQuantity: 50 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results: [...good, bad] }),
    repository: repo,
  });
  const saved = repo.state.persisted.flatMap((b) => b.leads);
  assert.equal(saved.length, 3);
  for (const lead of saved) {
    assert.ok(!/exemplo\.com\.br/i.test(lead.sourceUrl ?? ""));
    assert.ok(!/exemplo\.com\.br/i.test(lead.email ?? ""));
  }
});

test("15. idempotência: segunda busca com a mesma base não duplica leads", async () => {
  // Primeira execução salva leads.
  const repo1 = fakeRepository();
  const results = Array.from({ length: 3 }, (_, i) =>
    fakeResult({
      title: `Barbearia ${i} - São Paulo - SP`,
      url: `https://barbeariaidem${i}.com.br`,
      description: `Cortes em São Paulo - SP. (11) 98765-${String(5000 + i).padStart(4, "0")}. contato@barbeariaidem${i}.com.br`,
    }),
  );
  await runProspection(sp({ targetQuantity: 50 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results }),
    repository: repo1,
  });
  const firstRun = repo1.state.persisted.flatMap((b) => b.leads);
  assert.equal(firstRun.length, 3);

  // Segunda execução: a base já contém os fingerprints da primeira.
  const repo2 = fakeRepository();
  repo2.existingKeys = async () => ({
    phones: new Set(firstRun.map((l) => l.phone).filter(Boolean)),
    emails: new Set(firstRun.map((l) => l.email).filter(Boolean)),
    domains: new Set(),
  });
  await runProspection(sp({ targetQuantity: 50 }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results }),
    repository: repo2,
  });
  const secondRun = repo2.state.persisted.flatMap((b) => b.leads);
  assert.equal(secondRun.length, 0, "segunda execução não deve salvar duplicados");
  assert.ok(repo2.state.completed.data.summary.duplicates >= 3);
});

test("16. isolamento multi-tenant: businessId nunca é misturado", async () => {
  const results = Array.from({ length: 3 }, (_, i) =>
    fakeResult({
      title: `Barbearia ${i} - São Paulo - SP`,
      url: `https://barbeariaisolada${i}.com.br`,
      description: `Cortes em São Paulo - SP. (11) 98765-${String(6000 + i).padStart(4, "0")}. contato@barbeariaisolada${i}.com.br`,
    }),
  );
  const repoA = fakeRepository();
  const repoB = fakeRepository();
  await runProspection(sp({ targetQuantity: 3 }, { businessId: "biz-A", runId: "run-A" }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results }),
    repository: repoA,
  });
  await runProspection(sp({ targetQuantity: 3 }, { businessId: "biz-B", runId: "run-B" }), {
    ...RUN_OPTS,
    provider: createFakeProvider({ results }),
    repository: repoB,
  });
  for (const batch of repoA.state.persisted) {
    assert.equal(batch.businessId, "biz-A");
  }
  for (const batch of repoB.state.persisted) {
    assert.equal(batch.businessId, "biz-B");
  }
});
