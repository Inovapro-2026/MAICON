/**
 * PLANOS — aba de gestão de assinatura + bloqueio por vencimento.
 * Expirou a assinatura → bloqueia as funcionalidades (exceto a rota Planos,
 * por onde o cliente renova). O webhook da Cakto renova o período.
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

const mw = read("apps/api/src/middleware/active-subscription.ts");
const billing = read("apps/api/src/routes/billing.ts");
const sidebar = read("apps/dashboard/components/layout/sidebar.tsx");
const plano = read("apps/dashboard/app/(dashboard)/settings/plano/page.tsx");
const shell = read("apps/dashboard/components/layout/shell.tsx");

test("plano: middleware bloqueia assinatura expirada (exceto admin)", () => {
  assert.match(mw, /current_period_end\.getTime\(\) < Date\.now\(\)/);
  assert.match(mw, /PLATFORM_ADMIN/);
  assert.match(mw, /PLATFORM_STAFF/);
  assert.match(mw, /Seu plano expirou/);
});

test("plano: middleware aplicado em criar/iniciar campanha, prospectar e enviar mensagem", () => {
  const campaigns = read("apps/api/src/routes/campaigns.ts");
  assert.match(campaigns, /requireActiveSubscription/);
  const prospecting = read("apps/api/src/routes/prospecting.ts");
  assert.match(prospecting, /requireActiveSubscription/);
  const inbox = read("apps/api/src/routes/inbox.ts");
  assert.match(inbox, /requireActiveSubscription/);
});

test("plano: /billing/status expõe is_expired e expires_at", () => {
  assert.match(billing, /is_expired/);
  assert.match(billing, /expires_at: subscription\.current_period_end/);
});

test("plano: sidebar tem item 'Planos' (ícone de coroa)", () => {
  assert.match(sidebar, /href: "\/settings\/plano"/);
  assert.match(sidebar, /label: "Planos"/);
  assert.match(sidebar, /Crown/);
});

test("plano: página tem status, contagem e botão de renovar", () => {
  assert.match(plano, /Plano ativo/);
  assert.match(plano, /Faltam \$\{days\} dia/);
  assert.match(plano, /Renovar Assinatura/);
  assert.match(plano, /Gerenciar Pagamento/);
  assert.match(plano, /billing\/checkout/);
});

test("plano: modal de bloqueio no painel, exceto na rota Planos", () => {
  assert.match(shell, /billing-status/);
  assert.match(shell, /is_expired/);
  assert.match(shell, /Seu plano expirou/);
  assert.match(shell, /settings\/plano/);
  assert.match(shell, /isPlanos/);
});
