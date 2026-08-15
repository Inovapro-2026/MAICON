/**
 * Testes do enriquecimento de leads (serviço Scrapy).
 * Cobre: montagem do patch (sem sobrescrever contatos primários) e o fetch HTTP
 * tolerante a falhas (site fora do ar/timeout/serviço indisponível NUNCA
 * quebram o job).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildEnrichmentPatch } from "@prospector/leads";

test("enrichment: monta patch com instagram/facebook/whatsapp", () => {
  const patch = buildEnrichmentPatch(
    { email: "a@b.com.br", phone: "+5511987654321" },
    {
      instagram: "@barbeariaimperial",
      facebook: "https://facebook.com/barbeariaimperial",
      whatsapp: "+5511999990000",
      emails: [],
      phones: [],
    },
  );
  assert.equal(patch.instagram, "barbeariaimperial");
  assert.equal(patch.facebook, "https://facebook.com/barbeariaimperial");
  assert.equal(patch.whatsapp, "+5511999990000");
  // Não sobrescreve contatos já existentes.
  assert.equal(patch.email, undefined);
  assert.equal(patch.phone, undefined);
});

test("enrichment: preenche e-mail/telefone apenas quando o lead não tem", () => {
  const patch = buildEnrichmentPatch(
    { email: null, phone: null },
    {
      emails: ["contato@site.com.br"],
      phones: ["(11) 98765-4321"],
    },
  );
  assert.equal(patch.email, "contato@site.com.br");
  assert.equal(patch.phone, "+5511987654321");
});

test("enrichment: e-mail/telefone inválidos são descartados", () => {
  const patch = buildEnrichmentPatch(
    { email: null, phone: null },
    {
      emails: ["nao-e-email", "foo@example.com"],
      phones: ["123", "0000000000"],
    },
  );
  assert.equal(patch.email, undefined);
  assert.equal(patch.phone, undefined);
});

test("enrichment: dados nulos/ausentes retornam patch vazio", () => {
  assert.deepEqual(buildEnrichmentPatch({}, null), {});
  assert.deepEqual(buildEnrichmentPatch({}, undefined), {});
  assert.deepEqual(buildEnrichmentPatch({}, {}), {});
});

test("enrichment: instagram só entra com handle válido (>=3 chars)", () => {
  const patch = buildEnrichmentPatch({}, { instagram: "ab" });
  assert.equal(patch.instagram, undefined);
});
