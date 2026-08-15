/**
 * Regressão da Parte 1: o FirecrawlClient NUNCA deve engolir erros.
 * Se a Firecrawl falhar (HTTP 5xx/4xx/timeout), a exceção precisa propagar
 * para o orquestrador marcar a run como FAILED — em vez de retornar [] e
 * virar "Concluída parcialmente" com zeros.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { FirecrawlClient } from "@prospector/prospector";

const FAKE_RATE_LIMITER = {
  wait: async () => undefined,
  close: async () => undefined,
};

function makeClient() {
  return new FirecrawlClient({
    apiKey: "test-key",
    baseUrl: "https://api.firecrawl.dev",
    timeoutMs: 500,
    retryAttempts: 1,
    rateLimiter: FAKE_RATE_LIMITER,
    businessId: "biz-test",
  });
}

test("firecrawl: search propaga erro HTTP 500 (não retorna [])", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response("boom", { status: 500 });
  try {
    await assert.rejects(
      () => makeClient().search("barbearia São Paulo", 5),
      /Firecrawl HTTP 500/,
    );
  } finally {
    global.fetch = original;
  }
});

test("firecrawl: search propaga erro definitivo 401 (chave inválida)", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response("unauthorized", { status: 401 });
  try {
    await assert.rejects(
      () => makeClient().search("barbearia São Paulo", 5),
      /Firecrawl HTTP 401/,
    );
  } finally {
    global.fetch = original;
  }
});

test("firecrawl: scrape propaga erro de rede (fetch rejeita)", async () => {
  const original = global.fetch;
  global.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  try {
    await assert.rejects(
      () => makeClient().scrape("https://barbearia.example.com.br"),
      /fetch failed/,
    );
  } finally {
    global.fetch = original;
  }
});

test("firecrawl: search retorna resultados em sucesso", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        data: [{ url: "https://barbearia.com.br", title: "Barbearia X" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  try {
    const results = await makeClient().search("barbearia São Paulo", 5);
    assert.equal(results.length, 1);
    assert.equal(results[0].url, "https://barbearia.com.br");
  } finally {
    global.fetch = original;
  }
});
