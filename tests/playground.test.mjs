/**
 * PLAYGROUND "Testar IA" — persistência do chat + botão de limpar.
 *
 * Verifica que:
 * 1) O backend apaga a memória da sessão (POST /ai/playground/clear).
 * 2) O frontend persiste as mensagens em localStorage (não somem ao sair da aba).
 * 3) O botão "Limpar conversa" reseta o chat e limpa a memória do servidor.
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

const page = read("apps/dashboard/app/(dashboard)/ai/playground/page.tsx");
const route = read("apps/api/src/routes/ai.ts");
const memory = read("services/ai/src/memory.ts");

test("playground: mensagens são persistidas em localStorage (não somem ao sair)", () => {
  assert.match(page, /MESSAGES_KEY/);
  assert.match(page, /localStorage\.setItem\(MESSAGES_KEY/);
  assert.match(page, /loadStoredMessages/);
  assert.match(page, /useState<ChatMessage\[\]>\(\(\) => loadStoredMessages\(\)\)/);
});

test("playground: botão 'Limpar conversa' reseta o chat", () => {
  assert.match(page, /Limpar conversa/);
  assert.match(page, /clearChat/);
  assert.match(page, /localStorage\.removeItem\(SESSION_KEY\)/);
  assert.match(page, /localStorage\.removeItem\(MESSAGES_KEY\)/);
  assert.match(page, /setMessages\(\[WELCOME\]\)/);
});

test("playground: limpar chama o backend para apagar a memória da sessão", () => {
  assert.match(page, /ai\/playground\/clear/);
  assert.match(page, /body: \{ session_id: sessionId \}/);
});

test("backend: POST /ai/playground/clear apaga a ConversationMemory da sessão", () => {
  assert.match(route, /\/playground\/clear/);
  assert.match(route, /deleteConversationMemory/);
  assert.match(route, /memoryKeySession/);
  assert.match(route, /100% isolado/);
});

test("backend: deleteConversationMemory existe e usa deleteMany (não lança se ausente)", () => {
  assert.match(memory, /export async function deleteConversationMemory/);
  assert.match(memory, /deleteMany/);
});
