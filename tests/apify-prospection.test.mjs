/**
 * PROSPECÇÃO MULTI-PLATAFORMA VIA APIFY (Google Maps + Instagram).
 *
 * Cobre: extração de contato (e-mail/telefone) da bio/link do Instagram,
 * mapeamento das duas fontes, deduplicação entre fontes, token nunca hardcoded,
 * falha visível (nunca contador zerado silencioso) e validação de fontes na API.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  extractEmailsFromText,
  extractPhonesBR,
  normalizePhone,
  isSocialLink,
  extractDomain,
  mapGoogleMapsRecord,
  buildGoogleMapsInput,
  mapInstagramRecord,
  extractInstagramContacts,
  buildInstagramInput,
  consolidateAcrossSources,
  normalizeNameForCompare,
  nameSimilarity,
  crossSourceKey,
} from "@prospector/prospector";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

// ---------------------------------------------------------------------------
// 1. Extração de contato do Instagram (bio / link externo)
// ---------------------------------------------------------------------------

test("apify: extrai e-mail e telefone BR da bio do Instagram", () => {
  const bio = "Barbearia Imperial ✂️ Agende: (11) 91234-5678 contato@imperial.com.br";
  const emails = extractEmailsFromText(bio);
  const phones = extractPhonesBR(bio);
  assert.deepEqual(emails, ["contato@imperial.com.br"]);
  assert.deepEqual(phones, ["5511912345678"]);
});

test("apify: telefone com +55 e espaços é normalizado", () => {
  assert.equal(normalizePhone("+55 11 98888-7777"), "5511988887777");
  assert.equal(normalizePhone("(11) 9777-1234"), "551197771234");
  assert.equal(normalizePhone(""), null);
});

test("apify: link externo de rede social/linktree NÃO vira website", () => {
  assert.equal(isSocialLink("https://linktr.ee/imperial"), true);
  assert.equal(isSocialLink("https://instagram.com/barbeariaimperial"), true);
  assert.equal(isSocialLink("https://barbeariaimperial.com.br"), false);
  assert.equal(extractDomain("https://www.barbeariaimperial.com.br/agenda"), "barbeariaimperial.com.br");
});

test("apify: extrai contatos do perfil do Instagram (bio + link)", () => {
  const contacts = extractInstagramContacts({
    biography: "Atendemos SP 📍 WhatsApp 11 99999-0000 venda@imperial.com.br",
    externalUrl: "https://barbeariaimperial.com.br",
  });
  assert.deepEqual(contacts.emails, ["venda@imperial.com.br"]);
  assert.deepEqual(contacts.phones, ["5511999990000"]);
  assert.equal(contacts.website, "https://barbeariaimperial.com.br");
});

// ---------------------------------------------------------------------------
// 2. Mapeamento Google Maps
// ---------------------------------------------------------------------------

test("apify: mapeia registro do Google Maps para lead bruto", () => {
  const lead = mapGoogleMapsRecord({
    title: "Barbearia Imperial",
    address: "Av. Paulista, 1000 - São Paulo",
    city: "São Paulo",
    phoneUnformatted: "5511912345678",
    website: "https://barbeariaimperial.com.br",
    categoryName: "Barbearia",
    placeId: "ChIJx",
    url: "https://www.google.com/maps/place/ChIJx",
  });
  assert.equal(lead?.source, "google_maps");
  assert.equal(lead?.name, "Barbearia Imperial");
  assert.equal(lead?.phone, "5511912345678");
  assert.equal(lead?.website, "https://barbeariaimperial.com.br");
  assert.equal(lead?.segment, "Barbearia");
  assert.equal(lead?.externalId, "ChIJx");
});

test("apify: registro do Google Maps sem título não gera lead", () => {
  assert.equal(mapGoogleMapsRecord({ placeId: "x" }), null);
});

// ---------------------------------------------------------------------------
// 3. Mapeamento Instagram
// ---------------------------------------------------------------------------

test("apify: mapeia perfil do Instagram com contato da bio", () => {
  const lead = mapInstagramRecord({
    fullName: "Barbearia Imperial",
    username: "barbeariaimperial",
    biography: "Cortes e barba 📞 (11) 9777-1234",
    externalUrl: "https://linktr.ee/imperial",
    followersCount: 1200,
    category: "Barbershop",
    url: "https://instagram.com/barbeariaimperial",
  });
  assert.equal(lead?.source, "instagram");
  assert.equal(lead?.phone, "551197771234");
  assert.equal(lead?.instagramUsername, "barbeariaimperial");
  assert.equal(lead?.website, undefined, "linktree não vira website");
  assert.equal(lead?.followersCount, 1200);
});

test("apify: perfil do Instagram sem nome/username não gera lead", () => {
  assert.equal(mapInstagramRecord({ biography: "oi" }), null);
});

// ---------------------------------------------------------------------------
// 4. Deduplicação entre fontes
// ---------------------------------------------------------------------------

test("apify: mesmo telefone nas duas fontes consolida em UM lead", () => {
  const consolidated = consolidateAcrossSources([
    {
      source: "google_maps",
      externalId: "gm-1",
      name: "Barbearia Imperial",
      phone: "5511912345678",
      website: "https://barbeariaimperial.com.br",
      city: "São Paulo",
    },
    {
      source: "instagram",
      externalId: "barbeariaimperial",
      name: "Barbearia Imperial",
      phone: "5511912345678",
      instagramUsername: "barbeariaimperial",
      bio: "bio",
      city: "São Paulo",
    },
  ]);
  assert.equal(consolidated.length, 1);
  assert.deepEqual(consolidated[0].sources.sort(), ["google_maps", "instagram"]);
  assert.equal(consolidated[0].instagramUsername, "barbeariaimperial");
});

test("apify: nome similar + mesma cidade cruza fontes (sem telefone/domínio)", () => {
  const consolidated = consolidateAcrossSources([
    {
      source: "google_maps",
      externalId: "gm-1",
      name: "Barbearia Imperial",
      city: "São Paulo",
    },
    {
      source: "instagram",
      externalId: "imperialoficial",
      name: "Barbearia Imperial",
      city: "São Paulo",
    },
  ]);
  assert.equal(consolidated.length, 1);
  assert.equal(consolidated[0].sources.length, 2);
});

test("apify: negócios diferentes NÃO são mesclados", () => {
  const consolidated = consolidateAcrossSources([
    {
      source: "google_maps",
      externalId: "gm-1",
      name: "Barbearia Imperial",
      city: "São Paulo",
    },
    {
      source: "instagram",
      externalId: "salaocorte",
      name: "Salão Corte & Estilo",
      city: "São Paulo",
    },
  ]);
  assert.equal(consolidated.length, 2);
});

test("apify: chave de cruzamento usa telefone/domínio/nome+cidade", () => {
  assert.match(crossSourceKey({ source: "google_maps", name: "X", phone: "5511912345678" }), /^phone:/);
  assert.match(
    crossSourceKey({ source: "google_maps", name: "X", website: "https://x.com.br" }),
    /^domain:/,
  );
  assert.match(crossSourceKey({ source: "instagram", name: "Barbearia", city: "SP" }), /^namecity:/);
  assert.equal(nameSimilarity("Barbearia Imperial", "Barbearia Imperial"), 1);
  assert.ok(nameSimilarity("Barbearia Imperial", "Barbearia Imprial") > 0.85);
  assert.equal(normalizeNameForCompare("Barbearia Imperial"), "barbearia imperial");
});

// ---------------------------------------------------------------------------
// 5. Segurança: token nunca hardcoded + falha visível
// ---------------------------------------------------------------------------

test("apify: token vem de variável de ambiente, nunca hardcoded", () => {
  const config = read("packages/config/src/index.ts");
  assert.match(config, /optional\("APIFY_API_TOKEN"\)/);
  assert.ok(!/apify_api_mAhX/.test(read("apps/worker/src/jobs/prospect-apify.processor.ts")), "token não pode estar no código");
  assert.match(read(".env.example"), /APIFY_API_TOKEN=""/);
});

test("apify: falha visível — job sem token marca a run FAILED e relança", () => {
  const processor = read("apps/worker/src/jobs/prospect-apify.processor.ts");
  assert.match(processor, /APIFY_TOKEN_MISSING/);
  assert.match(processor, /failRun\(runId, "APIFY_TOKEN_MISSING"/);
  assert.match(processor, /throw new Error/);
  assert.match(processor, /APIFY_SOURCE_FAILED/);
  assert.match(processor, /NUNCA contador zerado silenciosamente/);
});

test("apify: falha de UMA fonte derruba a run (mesmo com a outra ok)", () => {
  const processor = read("apps/worker/src/jobs/prospect-apify.processor.ts");
  assert.match(processor, /throw error/);
  assert.match(processor, /failRun\(runId, "APIFY_SOURCE_FAILED"/);
  assert.match(processor, /mesmo que a outra fonte tenha funcionado/);
});

test("apify: uso registrado separado por fonte em Usage", () => {
  const processor = read("apps/worker/src/jobs/prospect-apify.processor.ts");
  assert.match(processor, /recordUsage\(businessId, `apify_\$\{u\.source\}`, u\.count\)/);
  assert.match(processor, /business_id_metric_period/);
});

test("apify: API aceita sources e cria run com provider=apify", () => {
  const route = read("apps/api/src/routes/prospecting.ts");
  assert.match(route, /const APIFY_SOURCES = \["google_maps", "instagram"\]/);
  assert.match(route, /sources\.length/);
  assert.match(route, /provider: apifySources\.length \? "apify" : undefined/);
  assert.match(route, /sources: apifySources\.length \? apifySources : undefined/);
});

test("apify: lead sem e-mail/telefone TAMBÉM é criado (não bloqueia)", () => {
  const processor = read("apps/worker/src/jobs/prospect-apify.processor.ts");
  assert.match(processor, /tx\.lead\.create\(\{ data \}\)/);
  assert.match(processor, /lead sem e-mail\/telefone TAMBÉM/i);
  assert.ok(!/NO_CONTACT/.test(processor), "Apify não descarta lead por falta de contato");
});
