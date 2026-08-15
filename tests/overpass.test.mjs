/**
 * Testes do provider Overpass API (OpenStreetMap) — fonte gratuita.
 * Cobre: mapeamento de segmentos, construção da query QL, parsing de elementos
 * OSM, retry/timeout do cliente e comportamento explícito de falha
 * (segmento sem mapeamento / localização não resolvida NUNCA viram
 * "sucesso silencioso com zero").
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  segmentToOverpassFilters,
  buildOverpassQuery,
  parseOverpassElements,
  queryOverpass,
  OverpassProvider,
  buildDiscoveryProvider,
  MockDiscoveryProvider,
} from "@prospector/prospector";
import { config } from "@prospector/config";

// ----------------------------- mapeamento de segmentos -----------------------------
test("overpass: mapeia segmentos comuns para tags OSM (fuzzy, amplo)", () => {
  const barber = segmentToOverpassFilters("barbearia");
  assert.equal(barber.direct, true);
  assert.deepEqual(barber.filters, [
    '["shop"="hairdresser"]',
    '["shop"="barber"]',
    '["amenity"="barber_school"]',
  ]);
  assert.ok(segmentToOverpassFilters("salao").filters.includes('["shop"="beauty"]'));
  assert.ok(
    segmentToOverpassFilters("clinica odontologica").filters.includes(
      '["amenity"="dentist"]',
    ),
  );
  assert.ok(segmentToOverpassFilters("pet shop").filters.includes('["shop"="pet"]'));
  assert.ok(
    segmentToOverpassFilters("restaurante").filters.includes(
      '["amenity"="restaurant"]',
    ),
  );
  // Variações de escrita (acento, plural, espaço extra) caem no mesmo mapeamento.
  assert.deepEqual(
    segmentToOverpassFilters("Barbeira").filters,
    segmentToOverpassFilters("barbearia").filters,
  );
  assert.deepEqual(
    segmentToOverpassFilters("Barbearias").filters,
    segmentToOverpassFilters("barbearia").filters,
  );
  assert.deepEqual(
    segmentToOverpassFilters(" barbearia ").filters,
    segmentToOverpassFilters("barbearia").filters,
  );
});

test("overpass: NÃO existe 'não suportado' — qualquer segmento gera filtro (fallback por nome)", () => {
  // Sem tag direta -> busca por nome (nunca null / nunca "não suportado").
  const unmapped = segmentToOverpassFilters("construtora de piscinas");
  assert.equal(unmapped.direct, false);
  assert.ok(unmapped.filters.length >= 1);
  assert.match(unmapped.filters[0], /\["name"~".*",i\]/);

  const vazio = segmentToOverpassFilters("");
  assert.equal(vazio.direct, false);
  assert.ok(vazio.filters.length >= 1);
  const undef = segmentToOverpassFilters(undefined);
  assert.equal(undef.direct, false);
  assert.ok(undef.filters.length >= 1);
});

test("overpass: cobertura de diversos nichos reais (não só exemplos do placeholder)", () => {
  const cases = [
    ["barbearia", '["shop"="hairdresser"]'],
    ["pet shop", '["shop"="pet"]'],
    ["escritório de advocacia", '["office"="lawyer"]'],
    ["loja de roupas femininas", '["shop"="clothes"]'],
    ["academia de crossfit", '["leisure"="fitness_centre"]'],
    ["distribuidora de bebidas", '["shop"="alcohol"]'],
    ["consultório de fisioterapia", '["healthcare"="physiotherapist"]'],
    ["clínica odontológica", '["amenity"="dentist"]'],
    ["farmácia", '["amenity"="pharmacy"]'],
    ["imobiliária", '["office"="estate_agent"]'],
    ["contabilidade", '["office"="accountant"]'],
    ["supermercado", '["shop"="supermarket"]'],
  ];
  for (const [segment, tag] of cases) {
    const m = segmentToOverpassFilters(segment);
    assert.equal(m.direct, true, `"${segment}" deveria mapear diretamente`);
    assert.ok(m.filters.includes(tag), `"${segment}" -> ${tag}`);
  }
  // Termo específico/incomum sem tag -> fallback por nome, não erro.
  const esot = segmentToOverpassFilters("loja de instrumentos musicais");
  assert.ok(esot.direct, 'loja de instrumentos musicais -> shop=music');
  const esot2 = segmentToOverpassFilters("assistência técnica de ar condicionado");
  assert.equal(esot2.direct, false);
  assert.match(esot2.filters[0], /\["name"~".*",i\]/);
});

// ----------------------------- query builder -----------------------------
test("overpass: buildOverpassQuery inclui bbox, timeout e limite", () => {
  const ql = buildOverpassQuery({
    filters: ['["shop"="hairdresser"]'],
    bbox: { south: -23.7, west: -46.7, north: -23.5, east: -46.5 },
    limit: 10,
    timeoutSeconds: 60,
  });
  assert.match(ql, /\[out:json\]\[timeout:60\]/);
  assert.match(ql, /node\["shop"="hairdresser"\]\(-23\.7,-46\.7,-23\.5,-46\.5\)/);
  assert.match(ql, /way\["shop"="hairdresser"\]/);
  assert.match(ql, /out center 10/);
});

// ----------------------------- parsing de elementos -----------------------------
test("overpass: parseOverpassElements transforma elementos OSM em SearchResult", () => {
  const results = parseOverpassElements(
    [
      {
        type: "node",
        id: 123,
        tags: {
          name: "Barbearia Imperial",
          phone: "+55 11 98765-4321",
          email: "contato@barbeariaimperial.com.br",
          "addr:city": "São Paulo",
          "addr:state": "SP",
          "contact:instagram": "@barbeariaimperial",
        },
      },
      {
        type: "way",
        id: 456,
        tags: {
          name: "Salão Beleza Pura",
          website: "https://salaobelezapura.com.br",
          "addr:city": "Campinas",
          "addr:state": "SP",
        },
      },
    ],
    "São Paulo",
    "SP",
  );
  assert.equal(results.length, 2);

  const [barber, salon] = results;
  assert.equal(barber.title, "Barbearia Imperial");
  assert.match(barber.description, /\(11\) 98765-4321/);
  assert.match(barber.description, /contato@barbeariaimperial\.com\.br/);
  assert.match(barber.description, /Instagram: @barbeariaimperial/);
  assert.match(barber.description, /São Paulo - SP/);
  // Sem site: usa o link público do OSM como origem verificável.
  assert.equal(barber.url, "https://www.openstreetmap.org/node/123");

  assert.equal(salon.title, "Salão Beleza Pura");
  assert.equal(salon.url, "https://salaobelezapura.com.br");
});

// ----------------------------- cliente (retry/timeout) -----------------------------
test("overpass: queryOverpass retorna elementos em sucesso", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({ elements: [{ type: "node", id: 1, tags: { name: "X" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  try {
    const res = await queryOverpass("[out:json];(node;);out;", {
      apiUrl: "https://overpass.example",
      timeoutMs: 1000,
      retryAttempts: 1,
    });
    assert.equal(res.elements.length, 1);
  } finally {
    global.fetch = original;
  }
});

test("overpass: queryOverpass propaga erro definitivo (5xx) após retries", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response("rate limited", { status: 503 });
  try {
    await assert.rejects(
      () =>
        queryOverpass("ql", {
          apiUrl: "https://overpass.example",
          timeoutMs: 1000,
          retryAttempts: 1,
        }),
      /Overpass HTTP 503/,
    );
  } finally {
    global.fetch = original;
  }
});

// ----------------------------- provider -----------------------------
function providerWith(fetchImpl) {
  return new OverpassProvider({
    businessId: "biz-test",
    segment: "barbearia",
    country: "Brasil",
    state: "SP",
    city: "São Paulo",
    targetQuantity: 5,
    apiUrl: "https://overpass.example/interpreter",
    timeoutMs: 2000,
    retryAttempts: 1,
    nominatimUrl: "https://nominatim.example",
  });
}

test("overpass: provider transforma resposta real em SearchResult", async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body) });
    if (String(url).includes("nominatim")) {
      return new Response(
        JSON.stringify([
          { boundingbox: ["-23.7", "-23.5", "-46.7", "-46.5"] },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        elements: [
          {
            type: "node",
            id: 77,
            tags: {
              name: "Barbearia Central",
              phone: "11 98765-4321",
              "addr:city": "São Paulo",
              "addr:state": "SP",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const provider = providerWith();
    const results = await provider.searchBusinesses("barbearia São Paulo", 5);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Barbearia Central");
    assert.match(results[0].description, /São Paulo - SP/);
    // O geocoding foi chamado antes da Overpass.
    assert.ok(calls.some((c) => c.url.includes("nominatim")));
    assert.ok(calls.some((c) => c.url.includes("overpass")));
  } finally {
    global.fetch = original;
  }
});

test("overpass: segmento sem tag direta usa fallback por NOME (não é 'não suportado')", async () => {
  const original = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).includes("nominatim")) {
      return new Response(
        JSON.stringify([{ boundingbox: ["-23.7", "-23.5", "-46.7", "-46.5"] }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // Overpass: retorna elementos cujo NOME contenha o termo.
    return new Response(
      JSON.stringify({
        elements: [
          {
            type: "node",
            id: 999,
            tags: {
              name: "ConstruPiscinas",
              phone: "11 91234-5678",
              "addr:city": "São Paulo",
              "addr:state": "SP",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const provider = new OverpassProvider({
      ...providerParams(),
      segment: "construtora de piscinas",
    });
    const results = await provider.searchBusinesses("construtora de piscinas", 5);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "ConstruPiscinas");
  } finally {
    global.fetch = original;
  }
});

test("overpass: localização não resolvida -> erro claro", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  try {
    const provider = providerWith();
    await assert.rejects(
      () => provider.searchBusinesses("barbearia São Paulo", 5),
      /Não foi possível resolver a localização alvo/,
    );
  } finally {
    global.fetch = original;
  }
});

function providerParams() {
  return {
    businessId: "biz-test",
    country: "Brasil",
    state: "SP",
    city: "São Paulo",
    targetQuantity: 5,
    apiUrl: "https://overpass.example/interpreter",
    timeoutMs: 2000,
    retryAttempts: 1,
    nominatimUrl: "https://nominatim.example",
  };
}

// ----------------------------- buildDiscoveryProvider -----------------------------
test("overpass: buildDiscoveryProvider nunca retorna mock em produção", async () => {
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
    assert.ok(typeof built.provider.searchBusinesses === "function");
    assert.ok(typeof built.provider.crawlBusiness === "function");
  } finally {
    await built.rateLimiter?.close().catch(() => undefined);
  }
});
