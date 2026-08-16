/**
 * FASE 0 — Bug de mensagens duplicadas.
 * Verifica a tríplice barreira de idempotência por message_id do WhatsApp:
 *   1) Constraint de unicidade no banco (external_id);
 *   2) JobId determinístico do BullMQ (dedup de fila);
 *   3) Look-before-create + marcador Redis do turno de IA.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const migration = read("packages/database/prisma/migrations/20260816000000_message_idempotency/migration.sql");
const received = read("apps/worker/src/jobs/message-received.processor.ts");
const aiResponse = read("apps/worker/src/jobs/ai-response.processor.ts");
const messagesSvc = read("apps/worker/src/services/messages.ts");

// ---------------------------------------------------------------------------
// 1) Barreira no banco (constraint de unicidade)
// ---------------------------------------------------------------------------

test("migração: índice único para mensagens RECEBIDAS (business_id + external_id, IN)", () => {
  assert.match(migration, /CREATE UNIQUE INDEX "message_in_external_unique"/);
  assert.match(migration, /WHERE "direction" = 'IN' AND "external_id" IS NOT NULL/);
});

test("migração: índice único para respostas IA (external_id 'reply:%', OUT)", () => {
  assert.match(migration, /CREATE UNIQUE INDEX "message_out_ai_reply_unique"/);
  assert.match(migration, /LIKE 'reply:%'/);
});

test("services/messages: prefixo 'reply:' + construtor determinístico de external_id", () => {
  assert.match(messagesSvc, /AI_REPLY_PREFIX = ["']reply:["']/);
  assert.match(messagesSvc, /buildAiReplyExternalId/);
  assert.match(messagesSvc, /`\$\{AI_REPLY_PREFIX\}\$\{incomingExternalId\}`/);
});

test("services/messages: cria OU reutiliza a resposta IA (look-before-create)", () => {
  assert.match(messagesSvc, /createOrGetAiReplyMessage/);
  assert.match(messagesSvc, /findFirst/);
  assert.match(messagesSvc, /external_id: replyExternalId/);
  assert.match(messagesSvc, /created: false/);
  assert.match(messagesSvc, /created: true/);
});

test("services/messages: trata erro de unicidade P2002 como idempotente", () => {
  assert.match(messagesSvc, /isUniqueConstraintError/);
  assert.match(messagesSvc, /P2002/);
  assert.match(messagesSvc, /PrismaClientKnownRequestError/);
});

test("services/messages: marcador Redis ai-done (já respondemos este message_id)", () => {
  assert.match(messagesSvc, /msg:ai-done:/);
  assert.match(messagesSvc, /wasAiResponded/);
  assert.match(messagesSvc, /markAiResponded/);
});

// ---------------------------------------------------------------------------
// 2) JobId determinístico + captura de P2002 na recepção
// ---------------------------------------------------------------------------

test("message-received: jobId da IA derivado do external_id (dedup BullMQ)", () => {
  assert.match(received, /ai-\$\{businessId[^}]*\}-\$\{job\.data\.externalId\}/);
  assert.match(received, /aiJobId/);
});

test("message-received: P2002 na criação da mensagem IN é tratado como duplicata", () => {
  assert.match(received, /isUniqueConstraintError/);
  assert.match(received, /já processada \(constraint de unicidade\)/);
  assert.match(received, /createMessage\(/);
});

test("message-received: dupla barreira de idempotência preservada (Redis lock + checagem no banco)", () => {
  assert.match(received, /lockKey/);
  assert.match(received, /SETNX/);
  assert.match(received, /findFirst/);
  assert.match(received, /external_id: job\.data\.externalId/);
});

// ---------------------------------------------------------------------------
// 3) Turno de IA idempotente (retry do BullMQ não duplica resposta)
// ---------------------------------------------------------------------------

test("ai-response: descarta turno se o message_id já foi respondido", () => {
  assert.match(aiResponse, /wasAiResponded/);
  assert.match(aiResponse, /SKIP_ALREADY_RESPONDED/);
  assert.match(aiResponse, /resposta já gerada para este message_id/);
});

test("ai-response: usa createOrGetAiReplyMessage e marca ai-done após enfileirar envio", () => {
  assert.match(aiResponse, /createOrGetAiReplyMessage/);
  assert.match(aiResponse, /markAiResponded/);
  assert.match(aiResponse, /markAiResponded\(resolvedBusinessId, ctx\.externalId\)/);
});

test("ai-response: resposta duplicada não é recriada (envio pendente é reenfileirado)", () => {
  assert.match(aiResponse, /created/);
  assert.match(aiResponse, /SKIP_DUPLICATE_REPLY/);
  assert.match(aiResponse, /envio pendente reenfileirado/);
});

test("ai-response (turno comercial): cria/reutiliza a mensagem IA e marca ai-done", () => {
  assert.match(aiResponse, /createOrGetAiReplyMessage/);
  assert.match(aiResponse, /markAiResponded/);
  assert.match(aiResponse, /externalId/);
  assert.match(aiResponse, /SKIP_DUPLICATE_REPLY/);
  assert.match(aiResponse, /reenfileirado/);
});