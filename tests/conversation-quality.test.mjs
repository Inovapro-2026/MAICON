/**
 * QUALIDADE CONVERSACIONAL — golden conversations (Decision Engine + Memória).
 *
 * Não basta o teste técnico (sem vazamento, limites). Estes testes avaliam o
 * COMPORTAMENTO comercial: se a IA conduz a conversa como um consultor humano,
 * aproveita contexto, responde antes de perguntar e nunca pergunta o que o
 * cliente já informou — inclusive em turnos fragmentados como "redes sociais"
 * e "como", que só fazem sentido à luz da memória da conversa.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  deterministicCommercialAnalysis,
  questionFromNextAction,
  buildGeneratorInstruction,
} from "@prospector/ai";

function analyze(messages, leadName = null) {
  return deterministicCommercialAnalysis({
    history: messages.map((m) => ({ role: "user", content: m })),
    leadName,
  });
}

// Simula o fluxo real com memória persistida turno a turno.
function simulate(...messages) {
  let memory = null;
  const steps = [];
  for (const msg of messages) {
    const history = steps
      .filter((s) => s.role === "user")
      .map((s) => ({ role: "user", content: s.content }));
    history.push({ role: "user", content: msg });
    const a = deterministicCommercialAnalysis({ history, memory });
    memory = {
      summary: a.summary,
      current_goal: a.goal,
      next_action: a.next_action,
      last_question: questionFromNextAction(a.next_action),
      sales_stage: a.stage,
      known: a.known,
    };
    steps.push({ role: "user", content: msg, analysis: a });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Abertura natural — saudação sempre apresenta + pergunta o nome
// ---------------------------------------------------------------------------

test("golden: 'oi' → cumprimento, BUILD_RAPPORT (abre apresentando)", () => {
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

test("golden: BUILD_RAPPORT sempre pergunta o nome (direção da abertura)", () => {
  const directive = buildGeneratorInstruction(analyze(["oi"]));
  assert.match(directive, /nome/);
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
  assert.equal(a.known.segment?.value, "Barbearia");
  assert.notEqual(a.next_action, "ASK_BUSINESS_TYPE", "não pode perguntar o que já foi informado");
  assert.equal(a.known.need, null);
});

test("golden: 'quero saber mais' + já disse o negócio → pergunta como capta clientes", () => {
  const a = analyze(["oi", "quero saber mais", "tenho uma clínica"]);
  assert.equal(a.known.segment?.value, "Clínica");
  assert.equal(a.next_action, "ASK_CURRENT_ACQUISITION");
});

test("golden: aproveita segmento+necessidade na mesma mensagem", () => {
  const a = analyze([
    "oi",
    "tenho uma clínica e quero automatizar meu WhatsApp",
  ]);
  assert.equal(a.intent, "info_sharing");
  assert.equal(a.known.segment?.value, "Clínica");
  assert.equal(a.known.need?.value, "Automatizar");
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
  assert.equal(a.known.name?.value, "Maicon");
});

test("golden: detecta nome no leadName persistido", () => {
  const a = analyze(["oi"], "Maria");
  assert.equal(a.known.name?.value, "Maria");
});

// ---------------------------------------------------------------------------
// CONTEXT RECOVERY — memória persistente interpreta fragmentos
// (a conversa exata relatada pelo usuário)
// ---------------------------------------------------------------------------

test("golden: 'redes sociais' é interpretado como resposta à pergunta anterior, sem reiniciar", () => {
  const steps = simulate("oi", "pode sim", "barbearia", "redes sociais");
  const last = steps.at(-1).analysis;

  assert.equal(last.known.segment?.value, "Barbearia", "segmento mantido na memória");
  assert.equal(last.known.acquisition_channel?.value, "Redes sociais", "canal extraído da resposta fragmentada");
  assert.notEqual(last.next_action, "BUILD_RAPPORT", "NÃO pode voltar para abertura");
  assert.notEqual(last.intent, "greeting");
  assert.equal(last.stage, "DISCOVERY", "estágio preservado");
});

test("golden: 'como' (fragmento) é interpretado NO CONTEXTO, sem reiniciar nem pedir segmento", () => {
  const steps = simulate("oi", "pode sim", "barbearia", "redes sociais", "como");
  const last = steps.at(-1).analysis;

  assert.notEqual(last.next_action, "BUILD_RAPPORT", "não volta para abertura");
  assert.notEqual(last.next_action, "ASK_BUSINESS_TYPE", "não re-pergunta segmento");
  assert.equal(last.known.segment?.value, "Barbearia", "memória preservada");
  assert.equal(last.known.acquisition_channel?.value, "Redes sociais", "memória preservada");
  assert.equal(last.next_action, "ANSWER_QUESTION", "fragmento vira pedido de explicação no contexto");
  assert.equal(last.stage, "DISCOVERY", "estágio preservado");
});

test("golden: estado avançado nunca volta para NEW/BUILD_RAPPORT", () => {
  // Simula uma falha de análise (mensagem ambígua) com memória avançada.
  const memory = {
    summary: "Cliente tem barbearia, capta por redes sociais.",
    current_goal: "understand_pain",
    next_action: "UNDERSTAND_PAIN",
    last_question: "Qual é a maior dificuldade de vocês hoje?",
    sales_stage: "DISCOVERY",
    known: {
      name: null,
      segment: { value: "Barbearia", source: "customer", confidence: 1 },
      need: null,
      acquisition_channel: { value: "Redes sociais", source: "customer", confidence: 1 },
    },
  };
  const a = deterministicCommercialAnalysis({
    history: [{ role: "user", content: "blá blá blá" }],
    memory,
  });
  assert.notEqual(a.stage, "NEW", "não pode reiniciar o estágio");
  assert.notEqual(a.next_action, "BUILD_RAPPORT", "não pode voltar para abertura");
  assert.equal(a.known.segment?.value, "Barbearia", "fatos preservados pela memória");
});
