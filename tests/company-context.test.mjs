/**
 * CONTEXTO DA EMPRESA — os fatos cadastrados (site, instagram, telefone,
 * horários, posicionamento...) devem chegar ao modelo, e o agente NUNCA deve
 * inventar "[link]" quando existe URL cadastrado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildCommercialReplyMessages, GENERATOR_CONDUCT } from "@prospector/ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function analysis() {
  return {
    intent: "question",
    stage: "EVALUATION",
    known: { name: null, segment: null, need: null, acquisition_channel: null },
    goal: "answer_question",
    next_action: "ANSWER_QUESTION",
    customer: { name: "Maicon", segment: null, interest: null },
    technique_used: "understanding_confirmation",
    action: "CONTINUE_CONVERSATION",
    summary: "",
  };
}

test("contexto: site/instagram/telefone/horários chegam como FATOS OFICIAIS ao modelo", () => {
  const messages = buildCommercialReplyMessages(
    {
      agent: { name: "Atendente" },
      business: {
        name: "SAVYRON",
        website: "https://crm.inovapro.cloud/vitrine",
        instagram: "@savyron.ai",
        phone: "+55 11 97819-7645",
        openingHours: "Todos os dias, 24h",
      },
    },
    { history: [{ role: "user", content: "Qual o site?" }] },
    analysis(),
  );
  const full = messages.map((m) => m.content).join("\n");
  assert.match(full, /FATOS OFICIAIS DA EMPRESA/);
  assert.match(full, /crm\.inovapro\.cloud\/vitrine/);
  assert.match(full, /@savyron\.ai/);
  assert.match(full, /97819-7645/);
  assert.match(full, /Todos os dias/);
});

test("conduta: proíbe [link] e inventar URL quando existe endereço cadastrado", () => {
  assert.match(GENERATOR_CONDUCT, /use EXATAMENTE o valor cadastrado/);
  assert.match(GENERATOR_CONDUCT, /NUNCA escreva '\[link\]'/);
  assert.match(GENERATOR_CONDUCT, /nunca invente URLs/);
});

test("loader: agent-config carrega website/instagram/telefone/contexto", () => {
  const loader = read("services/ai/src/agent-config.ts");
  assert.match(loader, /website: businessSettings\?\.website/);
  assert.match(loader, /instagram: businessSettings\?\.instagram/);
  assert.match(loader, /openingHours: businessSettings\?\.opening_hours/);
  assert.match(loader, /targetAudience/);
  assert.match(loader, /positioning/);
  assert.match(loader, /additionalInstructions/);
});

test("API: apply-ai-config persiste os fatos em BusinessSettings", () => {
  const service = read("apps/api/src/services/ai-config.ts");
  assert.match(service, /businessSettings\.upsert/);
  assert.match(service, /website: input\.website/);
  assert.match(service, /opening_hours: input\.openingHours/);
  assert.match(service, /additional_instructions: input\.additionalInstructions/);
  const route = read("apps/api/src/routes/business.ts");
  assert.match(route, /targetAudience: body\.publico/);
  assert.match(route, /additionalInstructions: body\.instrucoes/);
});

test("UI: empresa-ia tem os novos campos de contexto", () => {
  const page = read("apps/dashboard/app/(dashboard)/settings/empresa-ia/page.tsx");
  assert.match(page, /Público-alvo/);
  assert.match(page, /Problemas que a empresa resolve/);
  assert.match(page, /Diferenciais da empresa/);
  assert.match(page, /Posicionamento/);
  assert.match(page, /Área de atendimento/);
  assert.match(page, /Objetivo principal/);
  assert.match(page, /Instruções adicionais para a IA/);
});
