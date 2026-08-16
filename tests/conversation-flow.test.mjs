/**
 * FASE C/D — Turno comercial estruturado (Motor Comercial).
 * A IA devolve saída estruturada { reply, customer, conversation, technique_used,
 * commercial_engine_version, action } — o backend valida e persiste. O JSON
 * nunca é exibido ao cliente. Substitui a antiga máquina de estados de onboarding.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommercialTurnMessages,
  buildCommercialOutputInstruction,
  normalizeCommercialOutput,
  COMMERCIAL_ENGINE_VERSION,
  COMMERCIAL_ACTIONS,
  COMMERCIAL_STAGES,
  COMMERCIAL_TECHNIQUES,
} from "@prospector/ai";

// ---------------------------------------------------------------------------
// Construção do turno
// ---------------------------------------------------------------------------

test("turno: pede saída JSON estruturada como ÚLTIMA mensagem do usuário", () => {
  const messages = buildCommercialTurnMessages(
    {},
    { history: [{ role: "user", content: "Quero saber os planos" }] },
  );
  const last = messages[messages.length - 1];
  assert.equal(last.role, "user");
  assert.match(last.content, /Mensagem mais recente do cliente: "Quero saber os planos"/);
  assert.match(last.content, /JSON válido/);
});

test("turno: o formato da saída estrutura reply/customer/conversation/technique/action", () => {
  const instruction = buildCommercialOutputInstruction();
  for (const key of ["reply", "customer", "conversation", "technique_used", "commercial_engine_version", "action"]) {
    assert.ok(instruction.includes(`"${key}"`), `saída deve conter "${key}"`);
  }
  assert.match(instruction, /CONTINUE_CONVERSATION/);
  assert.match(instruction, /TRANSFER_TO_HUMAN/);
  assert.match(instruction, /CLOSE_CONVERSATION/);
});

// ---------------------------------------------------------------------------
// Normalização da saída (backend valida valores arbitrários do modelo)
// ---------------------------------------------------------------------------

test("normaliza: campos válidos são preservados", () => {
  const out = normalizeCommercialOutput({
    reply: "Claro! Nossos planos começam em R$ 97.",
    customer: { name: "Maicon", segment: "Barbearia", interest: true },
    conversation: { stage: "EVALUATION" },
    technique_used: "conversion_lead",
    action: "CONTINUE_CONVERSATION",
  });
  assert.equal(out.reply, "Claro! Nossos planos começam em R$ 97.");
  assert.equal(out.customer.name, "Maicon");
  assert.equal(out.customer.interest, true);
  assert.equal(out.stage, "EVALUATION");
  assert.equal(out.technique_used, "conversion_lead");
  assert.equal(out.action, "CONTINUE_CONVERSATION");
});

test("normaliza: valores inválidos caem para defaults seguros (nunca quebram o turno)", () => {
  const out = normalizeCommercialOutput({
    reply: "   ",
    customer: { name: 123, interest: "sim" },
    conversation: { stage: "ROTEIRO_INEXISTENTE" },
    technique_used: "hack",
    action: "EXPLODE",
  });
  assert.equal(out.reply, "");
  assert.equal(out.customer.name, null);
  assert.equal(out.customer.interest, null);
  assert.equal(out.stage, "NEW");
  assert.equal(out.technique_used, "calibrated_questions");
  assert.equal(out.action, "CONTINUE_CONVERSATION");
});

test("normaliza: tolera 'stage' no topo (atalho) e valida técnicas/estágios", () => {
  const out = normalizeCommercialOutput({
    reply: "ok",
    stage: "NEGOTIATION",
    technique_used: "respectful_close",
    action: "CLOSE_CONVERSATION",
  });
  assert.equal(out.stage, "NEGOTIATION");
  assert.equal(out.technique_used, "respectful_close");
  assert.equal(out.action, "CLOSE_CONVERSATION");
});

// ---------------------------------------------------------------------------
// Contrato do Motor Comercial (valores exportados)
// ---------------------------------------------------------------------------

test("motor: versão atual é v1", () => {
  assert.equal(COMMERCIAL_ENGINE_VERSION, "v1");
});

test("motor: estágios comerciais substituem o onboarding (CLOSED_* presente)", () => {
  assert.ok(COMMERCIAL_STAGES.includes("NEW"));
  assert.ok(COMMERCIAL_STAGES.includes("QUALIFYING"));
  assert.ok(COMMERCIAL_STAGES.includes("DISCOVERY"));
  assert.ok(COMMERCIAL_STAGES.includes("EVALUATION"));
  assert.ok(COMMERCIAL_STAGES.includes("NEGOTIATION"));
  assert.ok(COMMERCIAL_STAGES.includes("CLOSED_WON"));
  assert.ok(COMMERCIAL_STAGES.includes("CLOSED_LOST"));
  assert.ok(COMMERCIAL_ACTIONS.includes("TRANSFER_TO_HUMAN"));
  assert.ok(COMMERCIAL_ACTIONS.includes("CLOSE_CONVERSATION"));
  assert.ok(COMMERCIAL_TECHNIQUES.includes("respectful_close"));
});