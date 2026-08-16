/**
 * FASE A — Configuração unificada da empresa + IA.
 * Verifica o botão "Aplicar informações na IA" (config estruturada via Groq,
 * persistida em Business + AIAgent + AISettings, sem expor o JSON ao usuário).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  extractJsonObject,
  normalizeStructuredConfig,
  buildStructuredConfigPrompt,
} from "@prospector/ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const migration = read(
  "packages/database/prisma/migrations/20260816010000_ai_structured_config/migration.sql",
);
const businessRoute = read("apps/api/src/routes/business.ts");
const aiConfigSvc = read("apps/api/src/services/ai-config.ts");
const structuredConfig = read("services/ai/src/structured-config.ts");

// ---------------------------------------------------------------------------
// Módulo de configuração estruturada (services/ai)
// ---------------------------------------------------------------------------

test("structured-config: extrai JSON válido mesmo com texto ao redor", () => {
  const parsed = extractJsonObject(
    'Aqui está:\n```json\n{"agent":{"name":"X"}}\n```\nFim',
  );
  assert.deepEqual(parsed, { agent: { name: "X" } });
});

test("structured-config: extrai JSON de texto puro com conteúdo adjacente", () => {
  const parsed = extractJsonObject(
    'resposta: {"behavior":{"natural":true}} fim',
  );
  assert.deepEqual(parsed, { behavior: { natural: true } });
});

test("structured-config: normaliza shape com fallbacks determinísticos", () => {
  const config = normalizeStructuredConfig(
    { agent: { name: "Atendente da Loja" } },
    { name: "Loja Central", segment: "Loja" },
  );
  assert.equal(config.agent.name, "Atendente da Loja");
  assert.equal(config.agent.role, "consultor de vendas e suporte ao cliente");
  assert.match(config.agent.objective, /Loja Central/);
  assert.equal(config.company.segment, "Loja");
  assert.equal(config.behavior.natural, true);
  assert.equal(config.behavior.one_question_at_a_time, true);
});

test("structured-config: prompt pede JSON estruturado (empresa, agente, comportamento)", () => {
  const prompt = buildStructuredConfigPrompt({
    name: "Barbearia X",
    segment: "Barbearia",
  });
  assert.match(prompt, /"company"/);
  assert.match(prompt, /"agent"/);
  assert.match(prompt, /"behavior"/);
  assert.match(prompt, /one_question_at_a_time/);
  assert.match(prompt, /do_not_repeat_information/);
  assert.match(prompt, /Barbearia X/);
});

test("structured-config: usa JSON mode do provider com fallback determinístico", () => {
  assert.match(structuredConfig, /jsonMode: true/);
  assert.match(structuredConfig, /fallback determinístico/);
  assert.match(structuredConfig, /generateStructuredAIConfig/);
  const provider = read("services/ai/src/providers/provider.ts");
  assert.match(provider, /response_format/);
  assert.match(provider, /json_object/);
});

// ---------------------------------------------------------------------------
// Backend (rotas + serviço)
// ---------------------------------------------------------------------------

test("rota: GET /business/ai-config-status existente", () => {
  assert.match(businessRoute, /ai-config-status/);
  assert.match(businessRoute, /getAIConfigurationStatus/);
});

test("rota: POST /business/apply-ai-config existe, valida nome/segmento e não retorna o JSON", () => {
  assert.match(businessRoute, /apply-ai-config/);
  assert.match(businessRoute, /Informe o nome da empresa/);
  assert.match(businessRoute, /Selecione o segmento/);
  assert.match(businessRoute, /applyAIConfiguration/);
  assert.match(businessRoute, /NUNCA é retornado ao usuário/);
});

test("serviço: atualiza a configuração existente (upsert) — nunca cria paralela", () => {
  assert.match(aiConfigSvc, /nunca cria uma segunda configuração paralela/);
  assert.match(aiConfigSvc, /upsert/);
  assert.match(aiConfigSvc, /aISettings\.upsert/);
  assert.match(aiConfigSvc, /last_applied_at/);
  assert.match(aiConfigSvc, /findFirst/);
});

test("serviço: persiste em Business + AIAgent + AISettings (config estruturada)", () => {
  assert.match(aiConfigSvc, /prisma\.business\.update/);
  assert.match(aiConfigSvc, /prisma\.aIAgent/);
  assert.match(aiConfigSvc, /objective: config\.agent\.objective/);
  assert.match(aiConfigSvc, /behaviors: config\.behavior/);
});

test("migração: adiciona objective ao AIAgent e last_applied_at ao AISettings", () => {
  assert.match(migration, /ALTER TABLE "AIAgent" ADD COLUMN "objective"/);
  assert.match(
    migration,
    /ALTER TABLE "AISettings" ADD COLUMN "last_applied_at"/,
  );
});

// ---------------------------------------------------------------------------
// Loader de configuração usa o objetivo do agente no prompt
// ---------------------------------------------------------------------------

test("agent-config: carrega objective do agente", () => {
  const agentConfig = read("services/ai/src/agent-config.ts");
  assert.match(agentConfig, /objective/);
});

test("prompt-assembler: camada do agente inclui o objetivo", () => {
  const assembler = read("services/ai/src/prompt-assembler.ts");
  assert.match(assembler, /objective\?: string \| null/);
  assert.match(assembler, /Objetivo: \$\{agent\.objective/);
});
