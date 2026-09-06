/**
 * TESTES: fonte única de data/hora + filtro de resposta do agente.
 *
 * Garantem:
 * 1. getCurrentDateTime usa America/Sao_Paulo (nunca UTC "cru").
 * 2. parseNaturalDate calcula dias relativos a partir do RELÓGIO REAL
 *    fornecido (nunca de histórico/exemplos/constantes).
 * 3. O filtro de resposta bloqueia chain-of-thought, tool calls e JSON.
 * 4. Texto limpo passa intacto.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// `now` fixo controla o relógio: 2026-09-05T22:08:00Z.
// Em America/Sao_Paulo (UTC-3): sábado, 5 de setembro de 2026, 19:08.
const FIXED_NOW = new Date("2026-09-05T22:08:00Z");

const {
  getCurrentDateTime,
  parseNaturalDate,
  wallParts,
  wallToInstant,
  startOfSaoPauloDay,
  SAVYRON_TIMEZONE,
  formatDateForUser,
  describeCurrentDateTime,
} = await import("../apps/api/src/services/current-date.ts");

const {
  filterResponseForUser,
  containsInternalReasoning,
  REASONING_PATTERNS,
} = await import("../apps/api/src/services/response-filter.ts");

// ---------------------------------------------------------------------------
// Data/hora — America/Sao_Paulo
// ---------------------------------------------------------------------------

test("datetime: fuso padrão é America/Sao_Paulo", () => {
  assert.equal(SAVYRON_TIMEZONE, "America/Sao_Paulo");
});

test("datetime: 00:30Z do dia 1º/01/2026 é 21:30 do dia 31/12/2025 em São Paulo", () => {
  const c = getCurrentDateTime(new Date("2026-01-01T00:30:00Z"));
  assert.equal(c.date, "2025-12-31", "data calendário deve ser 31/12/2025");
  assert.equal(c.year, 2025);
  assert.equal(c.month, 12);
  assert.equal(c.dayOfMonth, 31);
  assert.equal(c.time, "21:30:00");
  assert.equal(c.time24h, "21:30");
  assert.equal(c.dayOfWeek, "quarta-feira");
});

test("datetime: 22:08Z/05/09/2026 = sábado 05/09/2026 19:08 em São Paulo", () => {
  const c = getCurrentDateTime(FIXED_NOW);
  assert.equal(c.date, "2026-09-05");
  assert.equal(c.dayOfWeek, "sábado");
  assert.equal(c.monthName, "setembro");
  assert.equal(c.time, "19:08:00");
  assert.ok(c.iso.includes("-03:00"), "iso deve carregar o offset -03:00");
});

test("datetime: formatDateForUser produz 'Hoje é sábado, 5 de setembro de 2026.'", () => {
  const c = getCurrentDateTime(FIXED_NOW);
  assert.equal(formatDateForUser(c), "Hoje é sábado, 5 de setembro de 2026.");
});

test("datetime: describeCurrentDateTime injeta a data real (não o texto de exemplo)", () => {
  const d = describeCurrentDateTime(FIXED_NOW);
  assert.ok(d.includes("Hoje é sábado, 5 de setembro de 2026"), d);
  assert.ok(d.includes("America/Sao_Paulo"), d);
  assert.ok(!d.includes("24 de agosto de 2025"), "nunca deve ecoar data alucinada");
});

test("datetime: startOfSaoPauloDay retorna instante UTc correspondente a meia-noite local", () => {
  const s = startOfSaoPauloDay(FIXED_NOW);
  assert.equal(s.toISOString(), "2026-09-05T03:00:00.000Z");
});

test("datetime: wallToInstant com hora 10:00 local = 13:00 UTC", () => {
  const inst = wallToInstant({ year: 2026, month: 9, day: 5, hour: 10, minute: 0 });
  const wall = wallParts(inst, "UTC");
  assert.equal(wall.hour, 13);
});

test("datetime: getCurrentDateTime nunca depende de constante — usa o relógio fornecido", () => {
  const a = getCurrentDateTime(FIXED_NOW);
  const b = getCurrentDateTime(new Date("2025-08-24T12:00:00Z"));
  assert.notEqual(a.date, b.date, "datas devem refletir o relógio passado, não uma constante");
});

// ---------------------------------------------------------------------------
// parseNaturalDate
// ---------------------------------------------------------------------------

test("parse: 'hoje' é a data real fornecida (nunca a do histórico)", () => {
  const parsed = parseNaturalDate("hoje", FIXED_NOW);
  assert.equal(parsed.date, "2026-09-05");
  assert.equal(parsed.dayOfWeek, "sábado");
});

test("parse: 'amanhã' = dia seguinte ao relógio real", () => {
  const parsed = parseNaturalDate("amanhã", FIXED_NOW);
  assert.equal(parsed.date, "2026-09-06");
  assert.equal(parsed.dayOfWeek, "domingo");
});

test("parse: 'ontem' = dia anterior ao relógio real", () => {
  const parsed = parseNaturalDate("ontem", FIXED_NOW);
  assert.equal(parsed.date, "2026-09-04");
});

test("parse: 'daqui a 5 dias'", () => {
  const parsed = parseNaturalDate("daqui a 5 dias", FIXED_NOW);
  assert.equal(parsed.date, "2026-09-10");
});

test("parse: 'semana que vem' = +7 dias", () => {
  const parsed = parseNaturalDate("semana que vem", FIXED_NOW);
  assert.equal(parsed.date, "2026-09-12");
});

test("parse: 'dia 15' = dia 15 do mês atual (ainda no futuro)", () => {
  const parsed = parseNaturalDate("dia 15", FIXED_NOW);
  assert.equal(parsed.date, "2026-09-15");
});

test("parse: 'dia 3' quando já passou vira dia 3 do mês seguinte", () => {
  const parsed = parseNaturalDate("dia 3", FIXED_NOW);
  assert.equal(parsed.date, "2026-10-03");
});

test("parse: '15 de dezembro' (passado) vira 15/12 do próximo ano", () => {
  const parsed = parseNaturalDate("15 de dezembro", FIXED_NOW);
  assert.equal(parsed.date, "2026-12-15");
});

test("parse: '15 de março' (passado após) vira ano seguinte", () => {
  const parsed = parseNaturalDate("15 de março", FIXED_NOW);
  assert.equal(parsed.date, "2027-03-15");
});

test("parse: '10 de outubro de 2026' ano explícito é respeitado", () => {
  const parsed = parseNaturalDate("10 de outubro de 2026", FIXED_NOW);
  assert.equal(parsed.date, "2026-10-10");
});

test("parse: 'próxima segunda-feira' cai sempre em uma segunda", () => {
  const parsed = parseNaturalDate("próxima segunda-feira", FIXED_NOW);
  assert.equal(parsed.dayOfWeek, "segunda-feira");
  // sábado(5/9) → segunda seguinte é 7/9
  assert.equal(parsed.date, "2026-09-07");
});

test("parse: 'sábado' (hoje é sábado) vira o próximo sábado", () => {
  const parsed = parseNaturalDate("sábado", FIXED_NOW);
  assert.equal(parsed.dayOfWeek, "sábado");
  assert.equal(parsed.date, "2026-09-12");
});

test("parse: 'mês que vem' = primeiro dia do próximo mês", () => {
  const parsed = parseNaturalDate("mês que vem", FIXED_NOW);
  assert.equal(parsed.date, "2026-10-01");
});

test("parse: 'final do mês' = último dia do mês atual", () => {
  const parsed = parseNaturalDate("final do mês", FIXED_NOW);
  assert.equal(parsed.date, "2026-09-30");
});

test("parse: 'ano que vem' = 1º de janeiro do próximo ano", () => {
  const parsed = parseNaturalDate("ano que vem", FIXED_NOW);
  assert.equal(parsed.date, "2027-01-01");
});

test("parse: data desconhecida retorna null (sem data inventada)", () => {
  assert.equal(parseNaturalDate("não sei", FIXED_NOW), null);
  assert.equal(parseNaturalDate("", FIXED_NOW), null);
});

// ---------------------------------------------------------------------------
// Isolamento de histórico
// ---------------------------------------------------------------------------

test("parse: datas relativas mudam com o relógio — histórico antigo não muda 'hoje'", () => {
  const agoraDeSetembro = parseNaturalDate("hoje", new Date("2026-09-05T22:08:00Z"));
  const agoraDeFevereiro = parseNaturalDate("hoje", new Date("2027-02-14T10:00:00Z"));
  assert.equal(agoraDeSetembro.date, "2026-09-05");
  assert.equal(agoraDeFevereiro.date, "2027-02-14");
  assert.notEqual(agoraDeSetembro.date, agoraDeFevereiro.date);
});

// ---------------------------------------------------------------------------
// Filtro de resposta — anti chain-of-thought / tool call / JSON
// ---------------------------------------------------------------------------

test("filter: identifica raciocínio interno ('Okay, the user is asking...')", () => {
  assert.ok(
    containsInternalReasoning(
      "Okay, the user is asking what day is today. Let me check the conversation history...",
    ),
  );
  assert.ok(containsInternalReasoning("I need to provide the correct date."));
  assert.ok(containsInternalReasoning("Let me think about how to compute this."));
  assert.ok(containsInternalReasoning("Based on my reasoning, I should..."));
  assert.ok(containsInternalReasoning("Wait, I should confirm the date first."));
  assert.ok(containsInternalReasoning("Looking at the conversation history..."));
});

test("filter: texto limpo passa intacto", () => {
  const clean = "Hoje é sábado, 5 de setembro de 2026.";
  assert.equal(filterResponseForUser(clean), clean);
  assert.ok(!containsInternalReasoning(clean));
});

test("filter: resposta com raciocínio vaza apenas a resposta final", () => {
  const raw = [
    "Okay, the user is asking about today's date.",
    "Looking at the conversation, I don't have a reliable date.",
    "I need to provide the current date from the system.",
    "Hoje é sábado, 5 de setembro de 2026.",
  ].join("\n");
  const out = filterResponseForUser(raw);
  assert.ok(!/the user|I need|Looking at|Let me/i.test(out), `resposta final não pode conter raciocínio: "${out}"`);
  assert.ok(out.includes("Hoje é sábado"), out);
});

test("filter: 'Resposta final:' mantém apenas o conteúdo seguinte", () => {
  const raw = "Estou analisando os dados.\nResposta final: Seu próximo compromisso é amanhã às 10h.";
  const out = filterResponseForUser(raw);
  assert.ok(!out.includes("Estou analisando"), out);
  assert.ok(out.includes("amanhã às 10h"), out);
});

test("filter: remove rótulo de diálogo 'Assistente:' / 'JARVIS:'", () => {
  assert.equal(filterResponseForUser("Assistente: Hoje é sábado."), "Hoje é sábado.");
  assert.equal(filterResponseForUser("JARVIS: Seu saldo é positivo."), "Seu saldo é positivo.");
});

test("filter: remove blocos JSON de tool call que vazaram", () => {
  const raw = '<function=get_company>{"business_id":123}</function> Sua empresa está ativa.';
  const out = filterResponseForUser(raw);
  assert.ok(!out.includes("function="), out);
  assert.ok(!out.includes("business_id"), out);
  assert.ok(out.includes("Sua empresa está ativa"), out);
});

test("filter: remove códigos com backtick/JSON puro", () => {
  const raw = "```json\n{\"result\":\"x\"}\n```\nVocê tem 3 clientes ativos.";
  const out = filterResponseForUser(raw);
  assert.ok(!out.includes("```"), out);
  assert.ok(!out.includes('"result"'), out);
  assert.ok(out.includes("3 clientes ativos"), out);
});

test("filter: resposta 100% raciocínio não deixa texto vazar", () => {
  const raw = "Okay, the user is asking me to determine today's date.\nLet me check what I know.\nI need to provide an answer.";
  const out = filterResponseForUser(raw);
  assert.ok(!/the user|Let me|I need/i.test(out), "nenhum raciocínio pode vazar");
});

test("filter: patterns exportados cobrem o caso que bugou em produção", () => {
  const leaks = [
    "Okay, the user is asking about the current date and time.",
    "I need to provide a response.",
    "Let me think about the correct approach.",
    "Looking at the conversation history.",
    "According to my internal reasoning.",
    "Wait, I need to confirm this.",
  ];
  for (const leak of leaks) {
    assert.ok(REASONING_PATTERNS.some((re) => re.test(leak)), `padrão deve detectar: "${leak}"`);
  }
});