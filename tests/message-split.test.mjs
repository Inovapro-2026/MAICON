/**
 * PIPELINE DE MENSAGENS FRACIONADAS NO WHATSAPP.
 *
 * A IA pode gerar N mensagens (ex.: primeiro contato = apresentação + pergunta
 * do nome). O worker deve enviar CADA parte como uma mensagem independente,
 * sequencialmente, com delay natural e persistência individual — nunca juntar
 * tudo numa string única.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { splitReplyIntoMessages } from "@prospector/ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const processor = read("apps/worker/src/jobs/ai-response.processor.ts");
const turn = read("services/ai/src/commercial-turn.ts");

test("worker: envia o followUp/2ª parte como MENSAGEM INDEPENDENTE (não concatena)", () => {
  assert.match(processor, /result\.followUp \?\? replyParts\[1\]/);
  assert.match(processor, /content: secondPart/);
  assert.match(processor, /messageId: secondMessage\.id/);
  assert.ok(
    !/firstContent \+ secondPart|reply \+ followUp/.test(processor),
    "nunca concatenar as partes",
  );
});

test("worker: cria uma MESSAGE por parte + job de envio com delay natural", () => {
  assert.match(processor, /createMessage\(\{/);
  assert.match(processor, /externalId: secondExternalId/);
  assert.match(processor, /delay: splitMessageDelay\(\)/);
  assert.match(processor, /splitMessageDelay/);
  assert.match(processor, /messageSplitDelayMinMs/);
  assert.match(processor, /messageSplitDelayMaxMs/);
});

test("turn: NÃO há 2ª mensagem fixa de nome (abertura dinâmica, sem fallback hardcoded)", () => {
  assert.ok(!/NAME_QUESTION_FALLBACK/.test(turn), "sem fallback fixo de pergunta de nome");
  assert.ok(!/looksLikeNameQuestion/.test(turn), "sem validação de pergunta de nome hardcoded");
  assert.ok(!/onboardingDecision/.test(turn), "sem decisão de sequência obrigatória no turno");
});

test("split: divide em N mensagens sem cortar palavras/frases", () => {
  const long =
    "Boa noite! Eu sou o Atendente Virtual da SAVYRON, uma plataforma de inteligência comercial com IA. Para eu te atender melhor, qual é o seu nome?";
  const parts = splitReplyIntoMessages(long, 100, 2);
  assert.ok(parts.length >= 2, `deve gerar 2+ mensagens, veio ${parts.length}`);
  for (const p of parts) {
    assert.ok(p.length <= 100, `parte ${p.length} <= 100`);
    assert.ok(!/\s$/.test(p), "não termina com espaço");
    assert.ok(/[.!?]$/.test(p), `parte termina com pontuação: ${JSON.stringify(p.slice(-12))}`);
  }
});

test("split: com limite pequeno, NUNCA corta URL no meio", () => {
  const parts = splitReplyIntoMessages(
    "Confira aqui: https://crm.inovapro.cloud/vitrine e veja os planos.",
    80,
    2,
  );
  const url = parts.find((p) => p.includes("crm.inovapro.cloud"));
  assert.ok(url, "URL deve aparecer inteira em uma das partes");
  assert.match(url, /vitrine/, "URL completa (com /vitrine)");
  assert.ok(!/vitrine\.$/.test(parts.join(" ")), "URL não pode ser cortada no meio");
});

test("conduta: vendedor consultivo (responde + contextualiza + pergunta)", () => {
  const conduct = read("services/ai/src/commercial-engine.ts");
  assert.match(conduct, /RESPONDA \+ CONTEXTUALIZE \+ PERGUNTE/);
  assert.match(conduct, /aprofunde a dor antes de vender/);
  assert.match(conduct, /Lead quente/);
});

test("turn: conteúdo que não cabe é RESUMIDO (nunca cortado no final)", () => {
  assert.match(turn, /shouldSummarizeReply/);
  assert.match(turn, /summarizeReplyToFit/);
  assert.match(turn, /Reescreva a mensagem abaixo de forma CONCISA/);
  assert.match(turn, /mantém texto sanitizado/);
});

test("turn: limite de mensagens por resposta chega ao modelo (gera curto na origem)", () => {
  assert.match(turn, /máximo \$\{maxMsgs\} mensagem\(ns\)/);
  assert.match(turn, /prefira UMA mensagem/);
  assert.match(turn, /no máximo \$\{maxLen\} caracteres por mensagem/);
});

test("conduta: prioridade por tipo de pergunta (1 curta vs até 2 com detalhe)", () => {
  const conduct = read("services/ai/src/commercial-engine.ts");
  assert.match(conduct, /Prioridade por tipo de pergunta/);
  assert.match(conduct, /no máximo 2 mensagens curtas/);
  assert.match(conduct, /cada uma com sentido completo/);
});

test("BUG real ('gostaria de saber mais'): pipeline nunca termina no meio de palavra", () => {
  const validation = read("services/ai/src/response-validation.ts");
  assert.match(validation, /NUNCA corta no meio de uma palavra/);
  assert.match(validation, /palavra\/URL única maior que o limite/);
  assert.ok(
    !/cut = max;/.test(validation),
    "não pode existir corte bruto no meio de palavra",
  );
});
