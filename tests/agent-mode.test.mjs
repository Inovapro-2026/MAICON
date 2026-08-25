/**
 * OBJETIVO DO AGENTE (agent_mode) — vendas / suporte / vendas+suporte.
 * O mesmo agente adapta a prioridade comportamental conforme o modo, e o modo
 * chega ao modelo via contexto dinâmico.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  normalizeAgentMode,
  buildAgentModeInstruction,
  buildCommercialReplyMessages,
} from "@prospector/ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function analysis(overrides = {}) {
  return {
    intent: "greeting",
    stage: "NEW",
    known: { name: null, segment: null, need: null, acquisition_channel: null },
    goal: "start_rapport",
    next_action: "BUILD_RAPPORT",
    customer: { name: null, segment: null, interest: null },
    technique_used: "tactical_empathy",
    action: "CONTINUE_CONVERSATION",
    summary: "",
    ...overrides,
  };
}

test("agent_mode: normaliza valores ('VENDAS' → sales, inválido → sales_support)", () => {
  assert.equal(normalizeAgentMode("VENDAS"), "sales");
  assert.equal(normalizeAgentMode("suporte"), "support");
  assert.equal(normalizeAgentMode("VENDAS + SUPORTE"), "sales_support");
  assert.equal(normalizeAgentMode("qualquer-coisa"), "sales_support");
});

test("agent_mode: instrução de cada modo é específica", () => {
  assert.match(buildAgentModeInstruction("sales"), /VENDAS/);
  assert.match(buildAgentModeInstruction("sales"), /conduzir para o próximo passo/);
  assert.match(buildAgentModeInstruction("support"), /resolver o problema/);
  assert.match(buildAgentModeInstruction("support"), /NÃO tente vender algo não relacionado/);
  assert.match(buildAgentModeInstruction("sales_support"), /Identifique PRIMEIRO a intenção/);
  assert.match(buildAgentModeInstruction("sales_support"), /NUNCA force uma venda durante uma situação de suporte/);
});

test("agent_mode: chega ao prompt do gerador (contexto dinâmico)", () => {
  const messages = buildCommercialReplyMessages(
    { agent: { name: "Atendente" }, business: { name: "SAVYRON" }, settings: { agentMode: "support" } },
    { history: [{ role: "user", content: "não consigo acessar minha conta" }] },
    analysis({ intent: "info_sharing" }),
  );
  const full = messages.map((m) => m.content).join("\n");
  assert.match(full, /MODO DO AGENTE: SUPORTE/);
});

test("agent_mode: config é armazenada em AISettings e exposta pela API", () => {
  const schema = read("packages/database/prisma/schema.prisma");
  assert.match(schema, /agent_mode\s+String\s+@default\("sales_support"\)/);
  const route = read("apps/api/src/routes/ai.ts");
  assert.match(route, /AGENT_MODES = \['sales', 'support', 'sales_support'\]/);
  assert.match(route, /body\.agent_mode/);
  const config = read("packages/database/prisma/migrations/20260820010000_agent_mode/migration.sql");
  assert.match(config, /ADD COLUMN "agent_mode"/);
});

test("agent_mode: UI tem as 3 opções (Vendas/Suporte/Vendas+Suporte)", () => {
  const page = read("apps/dashboard/app/(dashboard)/ai/settings/page.tsx");
  assert.match(page, /Objetivo do agente/);
  assert.match(page, /Especialista em vendas/);
  assert.match(page, /Especialista em atendimento/);
  assert.match(page, /Atendimento completo/);
  assert.match(page, /agent_mode/);
});
