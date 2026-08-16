/**
 * QUALIDADE CONVERSACIONAL — golden conversations (Decision Engine).
 *
 * Não basta o teste técnico (sem vazamento, limites). Estes testes avaliam o
 * COMPORTAMENTO comercial: se a IA conduz a conversa como um consultor humano,
 * aproveita contexto, responde antes de perguntar e nunca pergunta o que o
 * cliente já informou.
 *
 * Usam o DECISION ENGINE DETERMINÍSTICO (fallback do Groq), que é a camada de
 * decisão testável — o mesmo contrato que o Analyzer (LLM) deve seguir.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { deterministicCommercialAnalysis } from "@prospector/ai";

function analyze(messages, leadName = null) {
  return deterministicCommercialAnalysis({
    history: messages.map((m) => ({ role: "user", content: m })),
    leadName,
  });
}

// ---------------------------------------------------------------------------
// Abertura natural — saudação simples não deve vender
// ---------------------------------------------------------------------------

test("golden: 'oi' → cumprimento, quebrar o gelo, pedir permissão (não vender)", () => {
  const a = analyze(["oi"]);
  assert.equal(a.intent, "greeting");
  assert.equal(a.goal, "start_rapport");
  assert.equal(a.next_action, "BUILD_RAPPORT");
  assert.equal(a.action, "CONTINUE_CONVERSATION");
});

test("golden: 'bom dia' → cumprimento, mesmo comportamento", () => {
  const a = analyze(["Bom dia!"]);
  assert.equal(a.intent, "greeting");
  assert.equal(a.next_action, "BUILD_RAPPORT");
});

// ---------------------------------------------------------------------------
// Interesse → descoberta gradual (uma pergunta por vez)
// ---------------------------------------------------------------------------

test("golden: 'quero saber mais' sem contexto → pergunta o tipo de negócio", () => {
  const a = analyze(["oi", "quero saber mais"]);
  assert.equal(a.intent, "positive_response");
  assert.equal(a.goal, "discover_business");
  assert.equal(a.next_action, "ASK_BUSINESS_TYPE");
});

test("golden: depois de saber o negócio, não pergunta de novo — avança", () => {
  const a = analyze(["oi", "quero saber mais", "tenho uma barbearia"]);
  assert.equal(a.intent, "info_sharing");
  assert.equal(a.known.business_type, true);
  assert.notEqual(a.next_action, "ASK_BUSINESS_TYPE", "não pode perguntar o que já foi informado");
  assert.equal(a.known.need, false);
});

test("golden: 'quero saber mais' + já disse o negócio → pergunta como capta clientes", () => {
  const a = analyze(["oi", "quero saber mais", "tenho uma clínica"]);
  assert.equal(a.known.business_type, true);
  assert.equal(a.next_action, "ASK_CURRENT_ACQUISITION");
});

test("golden: aproveita segmento+necessidade na mesma mensagem", () => {
  const a = analyze([
    "oi",
    "tenho uma clínica e quero automatizar meu WhatsApp",
  ]);
  assert.equal(a.intent, "info_sharing");
  assert.equal(a.known.business_type, true);
  assert.equal(a.known.need, true);
  assert.notEqual(a.next_action, "ASK_BUSINESS_TYPE");
  assert.notEqual(a.next_action, "ASK_CURRENT_ACQUISITION");
});

// ---------------------------------------------------------------------------
// Pergunta objetiva → responder PRIMEIRO
// ---------------------------------------------------------------------------

test("golden: 'quanto custa?' → responder a pergunta antes de qualquer coisa", () => {
  const a = analyze(["quanto custa?"]);
  assert.equal(a.intent, "question");
  assert.equal(a.goal, "answer_question");
  assert.equal(a.next_action, "ANSWER_QUESTION");
});

test("golden: 'como funciona?' → responder a pergunta", () => {
  const a = analyze(["como funciona?"]);
  assert.equal(a.next_action, "ANSWER_QUESTION");
});

// ---------------------------------------------------------------------------
// Objeção e recusa
// ---------------------------------------------------------------------------

test("golden: 'já tenho CRM' → tratar objeção, sem confronto", () => {
  const a = analyze(["já tenho CRM"]);
  assert.equal(a.intent, "objection");
  assert.equal(a.goal, "handle_objection");
  assert.equal(a.next_action, "HANDLE_OBJECTION");
});

test("golden: 'não tenho interesse' → encerrar respeitosamente", () => {
  const a = analyze(["não tenho interesse"]);
  assert.equal(a.intent, "negative_response");
  assert.equal(a.next_action, "CLOSE_CONVERSATION");
  assert.equal(a.action, "CLOSE_CONVERSATION");
  assert.equal(a.customer.interest, false);
});

test("golden: 'só estou pesquisando' → sinal fraco, qualificar sem pressionar", () => {
  const a = analyze(["só estou pesquisando"]);
  assert.equal(a.next_action, "QUALIFY_INTEREST");
  assert.notEqual(a.action, "CLOSE_CONVERSATION");
});

test("golden: opt-out é respeitado imediatamente", () => {
  const a = analyze(["me tira da lista"]);
  assert.equal(a.intent, "opt_out");
  assert.equal(a.next_action, "CLOSE_CONVERSATION");
});

// ---------------------------------------------------------------------------
// Conversão
// ---------------------------------------------------------------------------

test("golden: 'quero contratar' → propor próximo passo (conversão)", () => {
  const a = analyze(["oi", "quero contratar"]);
  assert.equal(a.intent, "positive_response");
  assert.equal(a.next_action, "PROPOSE_NEXT_STEP");
  assert.equal(a.customer.interest, true);
});

// ---------------------------------------------------------------------------
// Contexto conhecido nunca é perguntado de novo
// ---------------------------------------------------------------------------

test("golden: nome conhecido é aproveitado, não re-perguntado", () => {
  const a = analyze(["meu nome é Maicon", "quero saber mais"], "Maicon");
  assert.equal(a.known.name, true);
});

test("golden: detecta nome no leadName persistido", () => {
  const a = analyze(["oi"], "Maria");
  assert.equal(a.known.name, true);
});
