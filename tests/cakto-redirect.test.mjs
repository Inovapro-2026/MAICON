/**
 * FLUXO PÓS-PAGAMENTO — após pagar no Cakto, o cliente deve VOLTAR para o
 * SAVYRON (/payment) e, com a confirmação do webhook, ir para /dashboard.
 * Nunca ser abandonado na tela de sucesso do Cakto.
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

const cakto = read("apps/api/src/services/cakto.ts");

test("cakto: checkout inclui redirect_url/return_url de volta ao SAVYRON", () => {
  assert.match(cakto, /params\.set\("redirect_url", returnUrl\)/);
  assert.match(cakto, /params\.set\("return_url", returnUrl\)/);
  assert.match(cakto, /\/payment\?from=checkout/);
});

test("cakto: webhook de aprovação ativa a empresa (status ACTIVE)", () => {
  const billing = read("apps/api/src/services/cakto-billing.ts");
  assert.match(billing, /purchase_approved/);
  assert.match(billing, /status: "ACTIVE"/);
  assert.match(billing, /PENDING_PAYMENT -> ACTIVE/);
  const webhook = read("apps/api/src/routes/webhooks.ts");
  assert.match(webhook, /\/webhooks\/cakto/);
});

test("pagamento: UI volta do checkout e confirma (verificar pagamento)", () => {
  const page = read("apps/dashboard/app/payment/page.tsx");
  assert.match(page, /params\.get\("from"\) === "checkout"/);
  assert.match(page, /fromCheckout/);
  assert.match(page, /Já paguei — verificar pagamento/);
  assert.match(page, /router\.push\("\/dashboard"\)/);
});
