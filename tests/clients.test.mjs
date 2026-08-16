/**
 * FASE D — Entidade Clientes (API).
 * GET /clients (leads com conversa, busca, paginação), GET /clients/:id,
 * GET /clients/:id/conversation (404 se não houver — NUNCA cria).
 * Toda query é filtrada por business_id (multi-tenant).
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

const routes = read("apps/api/src/routes/clients.ts");
const app = read("apps/api/src/app.ts");

test("rotas: cliente é o Lead com conversa (não duplica dados)", () => {
  assert.match(routes, /CLIENTES/);
  assert.match(routes, /telefone = um cliente por tenant/);
  assert.match(routes, /conversations: \{ some: \{\} \}/);
});

test("rotas: toda query é isolada por business_id (nunca sem filtro)", () => {
  assert.match(routes, /business_id: businessId/);
  assert.match(routes, /where: \{ id, business_id: businessId \}/);
  assert.match(routes, /requireAuth, requireBusiness/);
  assert.ok(!/business_id:\s*undefined/.test(routes));
});

test("rotas: GET /clients tem busca + paginação com limites seguros", () => {
  assert.match(routes, /pageSize/);
  assert.match(routes, /Math\.min\(100/);
  assert.match(routes, /contains: search, mode: "insensitive"/);
  assert.match(routes, /skip: \(page - 1\) \* pageSize/);
  assert.match(routes, /orderBy: \{ updated_at: "desc" \}/);
});

test("rotas: GET /clients/:id retorna 404 quando não pertence ao tenant", () => {
  assert.match(routes, /findFirst/);
  assert.match(routes, /Cliente não encontrado/);
  assert.match(routes, /404/);
});

test("rotas: GET /clients/:id/conversation NUNCA cria — 404 quando não há vínculo", () => {
  assert.match(routes, /conversation/);
  assert.match(routes, /NUNCA cria uma conversa/);
  assert.match(routes, /Nenhuma conversa vinculada a este cliente/);
  assert.ok(!/conversation\.create/.test(routes), "rota não deve criar conversa");
  assert.ok(!/create\(/.test(routes.split("/:id/conversation")[1] ?? ""), "bloco da rota não cria");
});

test("app: clientsRouter registrado em /clients", () => {
  assert.match(app, /import \{ clientsRouter \}/);
  assert.match(app, /app\.use\("\/clients", clientsRouter\)/);
});

test("worker: cria conversa com stage NEW por padrão", () => {
  const conversations = read("apps/worker/src/services/conversations.ts");
  assert.match(conversations, /stage: ["']NEW["']/);
});