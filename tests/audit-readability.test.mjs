/**
 * Legibilidade do /admin/audit: actions traduzidas, nomes resolvidos,
 * metadata formatado, fallback seguro e filtro/paginação preservados.
 * A rastreabilidade técnica (IDs) permanece intacta nos dados.
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

const labels = read("apps/dashboard/lib/audit-labels.ts");
const auditPage = read("apps/dashboard/app/admin/audit/page.tsx");
const adminRoute = read("apps/api/src/routes/admin.ts");

// ---------------------------------------------------------------------------
// Dicionário de ações -> frases em português
// ---------------------------------------------------------------------------

test("audit-labels: cobre as ações existentes com frase em português", () => {
  const required = [
    "admin.subscription.plan_changed",
    "admin.user.updated",
    "admin.business.status_changed",
    "admin.business.reset",
    "support.session_started",
    "support.session_ended",
    "admin.plan.created",
    "admin.user.created",
    "payment.confirmed",
    "payment.pix_generated",
    "subscription.renewed",
    "auth.signup",
    "business.created",
    "leads.imported.cleared",
    "prospection.deleted",
    "ai.settings.updated",
    "conversation.deleted",
  ];
  for (const a of required) {
    assert.match(labels, new RegExp(`"${a}": "`), `faltou tradução de ${a}`);
  }
});

test("audit-labels: fallback mostra o código técnico (nunca quebra a tela)", () => {
  assert.match(labels, /AUDIT_ACTION_LABELS\[action\] \?\? action;/);
});

test("audit-labels: formata metadata por tipo (plan_changed -> nome do plano)", () => {
  assert.match(labels, /describeAuditMeta/);
  assert.match(labels, /Plano alterado para/);
  assert.match(labels, /planNameById/);
  assert.match(labels, /platform_role: "Papel na plataforma"/);
  assert.match(labels, /warnings/);
});

// ---------------------------------------------------------------------------
// Página /admin/audit
// ---------------------------------------------------------------------------

test("audit page: usa as frases traduzidas e os nomes resolvidos", () => {
  assert.match(auditPage, /auditActionLabel/);
  assert.match(auditPage, /actor_name/);
  assert.match(auditPage, /entity_name/);
  assert.match(auditPage, /describeAuditMeta/);
  assert.match(auditPage, /rawMetaText/);
});

test("audit page: fallback para entidade sem nome resolvido (não quebra)", () => {
  assert.match(auditPage, /l\.entity \?/);
  assert.match(auditPage, /l\.actor \?/);
  assert.match(auditPage, /title=\{/);
});

test("audit page: filtro continua funcionando e aceita texto traduzido", () => {
  assert.match(auditPage, /resolveFilter/);
  assert.match(auditPage, /AUDIT_ACTION_LABELS/);
  assert.match(auditPage, /Carregar mais/);
  assert.match(auditPage, /hasMore/);
});

// ---------------------------------------------------------------------------
// Backend — resolução de nomes no endpoint de auditoria
// ---------------------------------------------------------------------------

test("backend: /admin/audit resolve actor_name e entity_name em lote", () => {
  assert.match(adminRoute, /resolveAuditLogs/);
  assert.match(adminRoute, /actor_name/);
  assert.match(adminRoute, /entity_name/);
  assert.match(adminRoute, /prisma\.user\.findMany/);
  assert.match(adminRoute, /prisma\.business\.findMany/);
  assert.match(adminRoute, /prisma\.subscription\.findMany/);
  assert.match(adminRoute, /Assinatura de/);
});

test("backend: filtro por ação usa contains (busca por trecho)", () => {
  assert.match(adminRoute, /action: \{ contains: action \}/);
});
