/**
 * Política de plano: prospecção web automática restrita à feature
 * `prospeccao_web` (habilitada apenas no plano Empresa).
 *
 * Segue o padrão de deletion-policy.test.mjs: invariantes verificadas por
 * inspeção do código-fonte real (validação sempre no backend, nunca só na UI).
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

const prospectRoute = read("apps/api/src/routes/prospecting.ts");
const billingService = read("apps/api/src/services/billing.ts");
const businessRoute = read("apps/api/src/routes/business.ts");
const seed = read("packages/database/src/seed.ts");
const migration = read(
  "packages/database/prisma/migrations/20260815010000_prospeccao_web_feature/migration.sql",
);
const prospectTab = read("apps/dashboard/components/prospect/prospect-tab.tsx");
const adminPlans = read("apps/dashboard/app/admin/plans/page.tsx");

// ---------------------------------------------------------------------------
// Backend — validação real no POST /leads/prospect
// ---------------------------------------------------------------------------

test("prospect: POST /leads/prospect valida a feature prospeccao_web", () => {
  assert.match(
    prospectRoute,
    /checkFeatureAccess\(\s*businessId,\s*"prospeccao_web",\s*req\.user,\s*\)/s,
  );
  assert.match(prospectRoute, /ApiError\.forbidden/);
  assert.match(prospectRoute, /plano Empresa/);
  // PLATFORM_ADMIN ignora a restrição de plano, com auditoria.
  assert.match(prospectRoute, /access\.adminBypass/);
  assert.match(prospectRoute, /prospection\.admin_bypass_plan/);
  // A checagem é feita com o businessId do token (nunca do payload/frontend).
  assert.match(prospectRoute, /const businessId = req\.user!\.businessId!/);
});

test("prospect: histórico NÃO é bloqueado por plano (visível após downgrade)", () => {
  // As rotas de consulta (GET /prospections*) não chamam a checagem de feature.
  const getRoutes = prospectRoute.match(/prospectingRouter\.get\(/g) ?? [];
  assert.ok(getRoutes.length >= 3);
  // A checagem de plano é chamada UMA única vez — apenas no POST /prospect.
  const checks = prospectRoute.match(/await checkFeatureAccess/g) ?? [];
  assert.equal(checks.length, 1);
});

test("billing: checkFeatureAccess consulta assinatura, valida enabled e bypassa PLATFORM_ADMIN", () => {
  assert.match(
    billingService,
    /where: \{ business_id: businessId \}/,
    "assinatura escopada por business_id",
  );
  assert.match(
    billingService,
    /plan_id_feature: \{ plan_id: subscription\.plan_id, feature \}/,
  );
  assert.match(billingService, /planFeature\?\.enabled === true/);
  // Acesso total para PLATFORM_ADMIN (por papel, nunca por e-mail).
  assert.match(
    billingService,
    /actor\?\.platform_role === "PLATFORM_ADMIN"/,
  );
  assert.match(billingService, /adminBypass: true/);
  assert.match(billingService, /checkFeatureAccess/);
});

test("billing: GET /business/settings expõe o plano e features para a interface", () => {
  assert.match(businessRoute, /subscription\.findUnique/);
  assert.match(businessRoute, /plan: \{ include: \{ features: true \} \}/);
  assert.match(businessRoute, /Object\.fromEntries/);
  assert.match(businessRoute, /features/);
});

// ---------------------------------------------------------------------------
// Seed + migração
// ---------------------------------------------------------------------------

test("seed: prospeccao_web habilitada apenas no plano Empresa", () => {
  assert.match(seed, /plansWithProspeccaoWeb = new Set\(\["enterprise"\]\)/);
  assert.match(seed, /feature: "prospeccao_web"/);
  assert.match(seed, /update: \{ enabled: webEnabled, limit: null \}/);
  assert.match(seed, /const webEnabled = plansWithProspeccaoWeb\.has\(planData\.slug\)/);
});

test("migração: insere/atualiza a feature nos 3 planos com enterprise habilitado", () => {
  assert.match(migration, /'prospeccao_web'/);
  assert.match(migration, /p\."slug" = 'enterprise'/);
  assert.match(migration, /ON CONFLICT \("plan_id", "feature"\)/);
  assert.match(migration, /initial.*professional.*enterprise/s);
});

// ---------------------------------------------------------------------------
// Interface — /prospect (form travado, importação manual intacta)
// ---------------------------------------------------------------------------

test("prospect-tab: formulário web é travado quando a feature não está habilitada", () => {
  assert.match(
    prospectTab,
    /business\.data\?\.plan\?\.features\?\.prospeccao_web/,
  );
  assert.match(prospectTab, /Fazer upgrade/);
  assert.match(prospectTab, /href="\/payment"/);
  assert.match(prospectTab, /Disponível no plano Empresa/);
  assert.match(prospectTab, /A prospecção web automática/);
});

test("prospect-tab: PLATFORM_ADMIN também é liberado na interface (não só no backend)", () => {
  assert.match(prospectTab, /platform_role === "PLATFORM_ADMIN"/);
  assert.match(prospectTab, /isPlatformAdmin/);
  assert.match(prospectTab, /webProspectingEnabled =/);
});

test("prospect: importação manual continua sem bloqueio de plano", () => {
  // A aba de importação vive no ImportTab (importado na página /prospect sem gate).
  const prospectPage = read("apps/dashboard/app/(dashboard)/prospect/page.tsx");
  assert.match(prospectPage, /import \{ ImportTab \}/);
  assert.match(prospectPage, /<ImportTab \/>/);
  // O ImportTab não lê a feature prospeccao_web.
  const importTab = read("apps/dashboard/components/prospect/import-tab.tsx");
  assert.ok(!importTab.includes("prospeccao_web"));
});

// ---------------------------------------------------------------------------
// Admin — /admin/plans
// ---------------------------------------------------------------------------

test("admin/plans: feature prospeccao_web aparece como recurso configurável", () => {
  assert.match(adminPlans, /prospeccao_web: "Prospecção web"/);
  assert.match(adminPlans, /features\.map/);
});
