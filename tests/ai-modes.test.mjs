/**
 * IA: auto-descrição da plataforma + perfil novo/conhecido (vendedora/suporte)
 * + regra de responder primeiro. Também cobre a aba "Guia de prompts" (Parte 1).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  buildAgentMessages,
  buildAgentSystemPrompt,
} from "@prospector/ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const assembler = read("services/ai/src/prompt-assembler.ts");
const processor = read("apps/worker/src/jobs/ai-response.processor.ts");
const sidebar = read("apps/dashboard/components/layout/sidebar.tsx");
const guide = read("apps/dashboard/app/(dashboard)/ai/prompt-guide/page.tsx");

// ---------------------------------------------------------------------------
// Auto-descrição da plataforma + "responda primeiro"
// ---------------------------------------------------------------------------

test("IA: system prompt inclui auto-descrição da SAVYRON (responde 'como funciona')", () => {
  const prompt = buildAgentSystemPrompt({});
  assert.match(prompt, /PROSPECTA → ENGAJA → VENDE → ATENDE/);
  assert.match(prompt, /base de conhecimento/);
  assert.match(prompt, /Testar IA/);
  assert.match(prompt, /SOBRE A PLATAFORMA SAVYRON/);
});

test("IA: regra reforçada de responder ANTES de perguntar", () => {
  const prompt = buildAgentSystemPrompt({});
  assert.match(prompt, /RESPONDA ANTES DE PERGUNTAR/);
  assert.match(prompt, /NUNCA responda apenas com "estou à disposição"/);
  assert.match(prompt, /PERGUNTA REPETIDA/);
});

// ---------------------------------------------------------------------------
// Perfil novo vs conhecido (vendedora vs suporte)
// ---------------------------------------------------------------------------

test("IA: contato CONHECIDO ativa modo SUPORTE", () => {
  const messages = buildAgentMessages({}, {
    contactType: "conhecido",
    history: [],
  });
  const context = messages.map((m) => m.content).join("\n");
  assert.match(context, /Tipo de contato: CONHECIDO\/CLIENTE/);
  assert.match(context, /MODO SUPORTE/);
  assert.match(context, /NÃO tente vender de novo/);
});

test("IA: contato NOVO ativa modo VENDEDORA", () => {
  const messages = buildAgentMessages({}, {
    contactType: "novo",
    history: [],
  });
  const context = messages.map((m) => m.content).join("\n");
  assert.match(context, /Tipo de contato: NOVO/);
  assert.match(context, /MODO VENDEDORA/);
  assert.match(context, /conduza para o próximo passo/);
});

test("worker: calcula contactType por dados reais (status/histórico)", () => {
  assert.match(processor, /engagedStatus/);
  assert.match(processor, /contactType: ["']novo["'] \| ["']conhecido["']/);
  assert.match(processor, /\? ["']conhecido["']/);
  assert.match(processor, /: ["']novo["']/);
  assert.match(processor, /contactType,/);
});

test("worker: usa buildAgentMessages (contexto do cliente chega ao modelo)", () => {
  assert.match(processor, /generateCommercialTurn\(context, \{ agentConfig \}\)/);
  assert.ok(!/generateAgentReply/.test(processor));
  assert.match(processor, /buildCommercialTurnMessages/);
});

test("worker: detecta pergunta repetida (indicador de qualidade)", () => {
  assert.match(processor, /isNearDuplicate/);
  assert.match(processor, /repeatedQuestion/);
  assert.match(processor, /\[AI_QUALITY\] pergunta repetida/);
});

// ---------------------------------------------------------------------------
// Parte 1 — Guia de prompts (sidebar + pré-preenchimento)
// ---------------------------------------------------------------------------

test("sidebar: item 'Guia de prompts' na seção IA", () => {
  assert.match(sidebar, /\/ai\/prompt-guide/);
  assert.match(sidebar, /label: "Guia de prompts"/);
  assert.match(sidebar, /Sparkles/);
});

test("guia: pré-preenche NOME DO NEGÓCIO/SEGMENTO com dados do Meu negócio", () => {
  assert.match(guide, /business-settings/);
  assert.match(guide, /useBusinessData/);
  assert.match(guide, /displayTemplate/);
  assert.match(guide, /Usar dados do meu negócio/);
  assert.match(guide, /\[COLOQUE O NOME DO NEGÓCIO\]/);
  assert.match(guide, /\[COLOQUE O SEGMENTO\]/);
});
