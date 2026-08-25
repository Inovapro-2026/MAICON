/**
 * ADMIN DASHBOARD — painel de inteligência (tendências, IA, mensagens).
 * O /admin/dashboard agora retorna séries históricas, consumo de tokens e
 * monitoramento de mensagens; a página exibe gráficos.
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

const route = read("apps/api/src/routes/admin.ts");
const page = read("apps/dashboard/app/admin/page.tsx");
const type = read("apps/dashboard/lib/admin.ts");

test("admin dashboard: retorna tendência de receita e crescimento", () => {
  assert.match(route, /revenue_trend/);
  assert.match(route, /business_growth/);
  assert.match(route, /recentPaymentsRows/);
  assert.match(route, /businessCreatedRows/);
});

test("admin dashboard: retorna consumo de IA (tokens + custo estimado)", () => {
  assert.match(route, /input_tokens/);
  assert.match(route, /output_tokens/);
  assert.match(route, /estimated_cost_brl/);
  assert.match(route, /aiTokensRows/);
});

test("admin dashboard: retorna mensagens (recebidas/enviadas/média)", () => {
  assert.match(route, /inboundMessages/);
  assert.match(route, /outboundMessages/);
  assert.match(route, /avg_per_client/);
});

test("admin page: tem gráficos (revenue trend + crescimento)", () => {
  assert.match(page, /AreaChart/);
  assert.match(page, /BarChart/);
  assert.match(page, /Evolução de faturamento/);
  assert.match(page, /Crescimento de empresas/);
});

test("admin page: seções Uso da IA e Mensagens com novos cards", () => {
  assert.match(page, /Tokens consumidos/);
  assert.match(page, /Custo estimado \(mês\)/);
  assert.match(page, /Gerações de IA/);
  assert.match(page, /Mensagens e interações/);
  assert.match(page, /Média por cliente/);
});

test("admin type: AdminDashboard tem os novos campos", () => {
  assert.match(type, /revenue_trend/);
  assert.match(type, /business_growth/);
  assert.match(type, /estimated_cost_brl/);
  assert.match(type, /avg_per_client/);
});
