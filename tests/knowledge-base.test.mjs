/**
 * BASE DE CONHECIMENTO → BUSCA → RELEVÂNCIA → CONTEXTO → AGENTE.
 *
 * Comprova que o agente encontra e usa os conhecimentos cadastrados (corte R$25
 * e SAVYRON IA com link), inclusive em perguntas de preço e pedidos de link.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { getRelevantKnowledge } from "@prospector/ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const BASE = [
  { title: "corte", content: "corte custa 25 reais" },
  { title: "barba", content: "barba custa 20 reais" },
  { title: "SAVYRON IA", content: "https://crm.inovapro.cloud/vitrine" },
];

test("KB: 'quanto custa o corte?' encontra o item corte (preço)", () => {
  const r = getRelevantKnowledge("Quanto custa o corte?", BASE);
  assert.ok(r.some((k) => k.title === "corte"), "deve incluir 'corte'");
});

test("KB: 'quanto custa a barba?' prioriza barba, não corte", () => {
  const r = getRelevantKnowledge("Quanto custa a barba?", BASE);
  const titles = r.map((k) => k.title);
  assert.ok(titles.includes("barba"), `deve incluir 'barba' → ${titles.join(",")}`);
  assert.ok(!titles.includes("corte"), "não deve trazer o preço do corte");
});

test("KB: 'quero conhecer a SAVYRON IA' encontra o item com link", () => {
  const r = getRelevantKnowledge("Quero conhecer a SAVYRON IA", BASE);
  const sav = r.find((k) => k.title === "SAVYRON IA");
  assert.ok(sav, "deve incluir 'SAVYRON IA'");
  assert.equal(sav?.content, "https://crm.inovapro.cloud/vitrine");
});

test("KB: 'qual valor?' após falar da SAVYRON IA usa o contexto (título mencionado)", () => {
  // O pipeline passa a mensagem atual + histórico recente.
  const context = "Quero conhecer a SAVYRON IA. Qual valor?";
  const r = getRelevantKnowledge(context, BASE);
  const sav = r.find((k) => k.title === "SAVYRON IA");
  assert.ok(sav, "'qual valor?' deve resolver para a SAVYRON IA via contexto");
});

test("KB: 'qual valor?' sem contexto ainda traz itens comerciais (preço/link) — fallback", () => {
  const r = getRelevantKnowledge("Qual valor?", BASE);
  assert.ok(r.length > 0, "não deve retornar vazio quando existem preço/link");
  assert.ok(
    r.some((k) => k.title === "corte" || k.title === "SAVYRON IA"),
    "fallback traz itens com preço ou link",
  );
});

test("KB: palavras-chave melhoram a recuperação", () => {
  const items = [
    { title: "Agendamento", content: "Agende pelo WhatsApp.", keywords: "agendar, marcar horário, reservar" },
  ];
  assert.ok(getRelevantKnowledge("quero marcar horário", items).some((k) => k.title === "Agendamento"));
});

test("KB: loader carrega somente itens ATIVOS e inclui keywords", () => {
  const loader = read("services/ai/src/agent-config.ts");
  assert.match(loader, /active: true/);
  assert.match(loader, /keywords: k\.keywords/);
  const turn = read("services/ai/src/commercial-turn.ts");
  assert.match(turn, /\[SALES_AI\]/);
  assert.match(turn, /relevant_knowledge/);
  assert.match(turn, /getRelevantKnowledge\(knowledgeContext/);
});

test("KB: itens desativados não entram no contexto (status)", () => {
  const route = read("apps/api/src/routes/ai.ts");
  assert.match(route, /active !== false/);
});

test("KB: API aceita keywords e novas categorias", () => {
  const route = read("apps/api/src/routes/ai.ts");
  assert.match(route, /keywords: keywords \? String\(keywords\)\.slice\(0, 500\) : null/);
  assert.match(route, /'PLANS'/);
  assert.match(route, /'PROMOTIONS'/);
  assert.match(route, /'BENEFITS'/);
  assert.match(route, /'COMMERCIAL_RULES'/);
  assert.match(route, /'LINKS'/);
});

test("KB: UI tem busca, filtros por categoria, contador e palavras-chave", () => {
  const page = read("apps/dashboard/app/(dashboard)/ai/knowledge/page.tsx");
  assert.match(page, /Pesquisar conhecimento/);
  assert.match(page, /Todos/);
  assert.match(page, /Conhecimentos:/);
  assert.match(page, /Ativos:/);
  assert.match(page, /Palavras-chave/);
  assert.match(page, /Tipo de conhecimento/);
  assert.match(page, /'PLANS'/);
  assert.match(page, /'LINKS'/);
});
