/**
 * ISOLAMENTO ANÁLISE → RESPOSTA (bug crítico de vazamento de raciocínio).
 *
 * Garante que nenhum reasoning, plano, instrução interna ou metadado chegue ao
 * campo `reply`. O gerador recebe prompt mínimo (sem camadas de regras) e o
 * OUTPUT VALIDATOR rejeita qualquer resposta com raciocínio interno vazado —
 * ela nunca é sanitizada (só regenerada/descartada).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateGeneratedReply,
  hasReasoningLeak,
  buildGeneratorInstruction,
  buildCommercialReplyMessages,
  COMMERCIAL_TECHNIQUES,
} from "@prospector/ai";

// ---------------------------------------------------------------------------
// 1. Detecção de vazamento de raciocínio interno
// ---------------------------------------------------------------------------

test("validator: detecta vazamentos de raciocínio/plano na resposta", () => {
  const leaks = [
    "We need to respond to 'oi'. Stage NEW. technique mirroring. Must send 1 message.",
    "Estágio: NEW. técnica: mirroring. ação: continue_conversation. must send 1 message, max 1 question",
    "RESPONDA ANTES DE PERGUNTAR. The client said oi.",
    "reasoning: Vou responder ao cliente de forma educada.",
    "analysis: stage=new. Vou gerar uma resposta.",
    "commercial_engine_version: v1. Minha resposta será um cumprimento.",
    "Configuração do agente: Atendente. Vou usar base de conhecimento.",
    "max emojis per message: 0. Regras globais do SAVYRON.",
    "intent: greeting. action: continue. Vou responder.",
  ];
  for (const leak of leaks) {
    assert.equal(
      hasReasoningLeak(leak),
      true,
      `deveria detectar vazamento: ${JSON.stringify(leak)}`,
    );
  }
});

test("validator: respostas limpas NÃO são marcadas como vazamento", () => {
  const clean = [
    "Olá! Tudo bem? Posso te mostrar rapidamente como o SAVYRON pode ajudar sua empresa?",
    "Entendi, Maicon. Vou te explicar: o SAVYRON automatiza a prospecção de clientes pelo WhatsApp e e-mail. O que você acha?",
    "Perfeito! Pode contar comigo.",
  ];
  for (const msg of clean) {
    assert.equal(
      hasReasoningLeak(msg),
      false,
      `não deveria marcar como vazamento: ${JSON.stringify(msg)}`,
    );
  }
});

test("validator: vazamento de raciocínio NUNCA é sanitizado — só rejeitado", () => {
  const v = validateGeneratedReply(
    "We need to respond to oi. Stage NEW. technique mirroring. must send 1 message.",
  );
  assert.equal(v.valid, false);
  assert.ok(v.issues.includes("raciocínio interno vazado na resposta"));
  assert.equal(v.sanitized, null, "vazamento não pode ser 'corrigido' por sanitização");
});

// ---------------------------------------------------------------------------
// 2. Limites rígidos da plataforma (400 chars, 4 frases, 1 pergunta, 0 emojis)
// ---------------------------------------------------------------------------

test("validator: aplica limites rígidos da plataforma", () => {
  const long = "x".repeat(401);
  assert.equal(validateGeneratedReply(long).valid, false);

  const manyQuestions = "Como funciona? Qual o preço? Onde vocês estão?";
  assert.equal(validateGeneratedReply(manyQuestions).valid, false);

  const manySentences = "Olá. Tudo bem. Como está. Espero que bem. Vejo você depois.";
  assert.equal(validateGeneratedReply(manySentences).valid, false);

  const emoji = "Olá! Tudo certo? 😀";
  assert.equal(validateGeneratedReply(emoji).valid, false);

  const clean = "Olá! Tudo bem? Posso te mostrar como o SAVYRON ajuda sua empresa.";
  assert.equal(validateGeneratedReply(clean).valid, true);
});

// ---------------------------------------------------------------------------
// 3. Gerador: prompt mínimo, sem jargão interno
// ---------------------------------------------------------------------------

test("generator: diretiva de postura NÃO expõe jargão interno ao modelo", () => {
  for (const technique of COMMERCIAL_TECHNIQUES) {
    const directive = buildGeneratorInstruction({
      stage: "NEW",
      technique_used: technique,
      action: "CONTINUE_CONVERSATION",
    });
    assert.ok(directive.length > 0, "diretiva não pode ser vazia");
    assert.ok(
      !/technique_used|Stage|stage[:=\s]|action[:=\s]|mirroring|calibrated_questions|respectful_close/i.test(
        directive,
      ),
      `diretiva não deve conter jargão interno: ${technique} → ${directive}`,
    );
  }
});

test("generator: mensagens de resposta não contêm camadas de regras internas", () => {
  const messages = buildCommercialReplyMessages(
    {
      agent: { name: "Atendente" },
      business: { name: "Barbearia X", segment: "Estética" },
    },
    { leadName: "Maicon", history: [{ role: "user", content: "oi" }] },
    {
      stage: "NEW",
      technique_used: "calibrated_questions",
      action: "CONTINUE_CONVERSATION",
    },
  );

  const full = messages.map((m) => m.content).join("\n");
  const forbidden = [
    "REGRAS DE SEGURANÇA DA PLATAFORMA",
    "REGRAS GLOBAIS DO SAVYRON",
    "MOTOR COMERCIAL GLOBAL",
    "AVISO FINAL DE SEGURANÇA",
    "RESPONDA ANTES DE PERGUNTAR",
    "must send",
    "Stage",
    "technique_used",
    "commercial_engine_version",
  ];
  for (const term of forbidden) {
    assert.ok(
      !full.includes(term),
      `prompt do gerador não deve conter: ${term}`,
    );
  }
});

test("generator: a última mensagem pede só a resposta ao cliente", () => {
  const messages = buildCommercialReplyMessages(
    {},
    { history: [{ role: "user", content: "oi" }] },
    {
      stage: "NEW",
      technique_used: "tactical_empathy",
      action: "CONTINUE_CONVERSATION",
    },
  );
  const last = messages[messages.length - 1];
  assert.equal(last.role, "user");
  assert.match(last.content, /Escreva agora a sua resposta ao cliente/);
});
