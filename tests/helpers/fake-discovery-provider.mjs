/**
 * Provider fake com dados realísticos e verificáveis para testes do
 * orquestrador e da camada anti-dados-fabricados.
 *
 * Diferente do MockDiscoveryProvider (`.exemplo.com.br`), este provider
 * produz domínios/e-mails/telefones plausíveis, e expõe a lista de resultados
 * para cada query para simular os cenários de validação.
 */
export function createFakeProvider({
  results = [],
  resultsByQuery = {},
  crawl = null,
}) {
  return {
    async searchBusinesses(query, limit) {
      const list = resultsByQuery[query] ?? results;
      return list.slice(0, limit);
    },
    async crawlBusiness(candidate) {
      if (crawl) return crawl(candidate);
      return { phones: [], emails: [] };
    },
    async close() {},
  };
}

/** Resultado realístico: domínio próprio, telefone e e-mail válidos. */
export function fakeResult(overrides = {}) {
  return {
    title: "Barbearia Central - São Paulo - SP",
    url: "https://barbeariacentral.com.br",
    description:
      "Cortes masculinos e barba em São Paulo - SP. Fale: (11) 98765-4321. contato@barbeariacentral.com.br",
    ...overrides,
  };
}

export function fakeRepository() {
  const state = { persisted: [], completed: null, progress: [] };
  return {
    state,
    async existingKeys() {
      return { phones: new Set(), emails: new Set(), domains: new Set() };
    },
    async updateProgress(runId, p) {
      state.progress.push({ runId, ...p });
    },
    async persistBatch(runId, businessId, campaignId, leads) {
      state.persisted.push({ runId, businessId, campaignId, leads });
      return {
        saved: leads.length,
        errors: 0,
        phones: leads.filter((l) => l.phone).length,
        emails: leads.filter((l) => l.email).length,
      };
    },
    async complete(runId, status, data) {
      state.completed = { runId, status, data };
    },
  };
}
