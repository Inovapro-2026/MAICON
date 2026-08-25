/**
 * Acesso total PLATFORM_ADMIN + melhorias em /admin/users.
 *
 * Segue o padrão de deletion-policy/plan-feature: invariantes de segurança
 * verificadas por inspeção do código-fonte real (validação sempre no backend,
 * confirmação destrutiva, auditoria).
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

const billing = read("apps/api/src/services/billing.ts");
const prospectRoute = read("apps/api/src/routes/prospecting.ts");
const authMiddleware = read("apps/api/src/middleware/auth.ts");
const authRoute = read("apps/api/src/routes/auth.ts");
const adminRoute = read("apps/api/src/routes/admin.ts");
const businessReset = read("apps/api/src/services/business-reset.ts");
const usersPage = read("apps/dashboard/app/admin/users/page.tsx");
const seed = read("packages/database/src/seed.ts");

// ---------------------------------------------------------------------------
// PARTE 1 — PLATFORM_ADMIN tem acesso total (ignora restrição de plano)
// ---------------------------------------------------------------------------

test("PLATFORM_ADMIN bypassa restrição de plano sem hardcodar e-mail", () => {
  // Checagem por papel, nunca por e-mail específico.
  assert.match(billing, /actor\?\.platform_role === "PLATFORM_ADMIN"/);
  assert.ok(!/ceo\.inovapro@maicon/.test(billing));
  assert.ok(!/ceo\.inovapro@maicon/.test(prospectRoute));
});

test("seed garante que o admin padrão é PLATFORM_ADMIN", () => {
  assert.match(seed, /platform_role: "PLATFORM_ADMIN"/);
});

test("rota de prospecção audita quando admin bypassa o plano", () => {
  assert.match(prospectRoute, /access\.adminBypass/);
  assert.match(prospectRoute, /prospection\.admin_bypass_plan/);
  assert.match(prospectRoute, /writeAudit/);
});

// ---------------------------------------------------------------------------
// PARTE 2 — Sessão ativa: conta desativada bloqueada a cada requisição
// ---------------------------------------------------------------------------

test("requireAuth revalida o status ativo a cada requisição (não só no login)", () => {
  assert.match(authMiddleware, /prisma\.user\.findUnique/);
  assert.match(authMiddleware, /where: \{ id: payload\.sub \}/);
  assert.match(authMiddleware, /user\.active === false/);
  assert.match(authMiddleware, /Conta desativada/);
});

test("requireAuth resolve a empresa padrão quando o token não tem businessId", () => {
  // Sessão antiga sem businessId: resolve o vínculo real do usuário (mesma
  // escolha do login), evitando "Nenhuma empresa selecionada".
  assert.match(authMiddleware, /!payload\.businessId/);
  assert.match(authMiddleware, /prisma\.businessMember\.findFirst/);
  assert.match(authMiddleware, /payload\.businessId = membership\.business_id/);
});

test("login também bloqueia conta desativada", () => {
  assert.match(authRoute, /user\.active === false/);
  assert.match(authRoute, /Conta desativada/);
});

// ---------------------------------------------------------------------------
// PARTE 2 — Reset de conta (POST /admin/businesses/:id/reset)
// ---------------------------------------------------------------------------

test("reset exige PLATFORM_ADMIN e confirmação EXCLUIR", () => {
  assert.match(adminRoute, /\/businesses\/:id\/reset/);
  assert.match(adminRoute, /adminWrite/);
  assert.match(adminRoute, /confirm !== "EXCLUIR"/);
  assert.match(adminRoute, /Confirmação inválida/);
});

test("reset limpa banco escopado + sessão WhatsApp + filas, e audita", () => {
  assert.match(adminRoute, /resetBusinessData\(businessId\)/);
  assert.match(adminRoute, /whatsapp\/clear-session/);
  assert.match(adminRoute, /removeBusinessJobs\(businessId\)/);
  assert.match(adminRoute, /action: "admin\.business\.reset"/);
  assert.match(adminRoute, /jobs_removed/);
});

test("business-reset apaga apenas dados da empresa (escopo por business_id)", () => {
  assert.match(businessReset, /const scope = \{ business_id: businessId \}/);
  assert.match(businessReset, /db\.lead\.deleteMany\(\{ where: scope \}\)/);
  assert.match(businessReset, /db\.campaign\.deleteMany\(\{ where: scope \}\)/);
  assert.match(businessReset, /db\.conversation\.deleteMany\(\{ where: scope \}\)/);
  assert.match(businessReset, /db\.message\.deleteMany\(\{ where: scope \}\)/);
  assert.match(businessReset, /db\.optOut\.deleteMany\(\{ where: scope \}\)/);
  assert.match(businessReset, /db\.aIGeneration\.deleteMany\(\{ where: scope \}\)/);
  assert.match(businessReset, /db\.deliveryEvent\.deleteMany\(\{ where: scope \}\)/);
  assert.match(businessReset, /db\.prospectionRun\.deleteMany\(\{ where: scope \}\)/);
  // Transação (evita estado parcialmente apagado).
  assert.match(businessReset, /db\.\$transaction/);
  // `resetBusinessData` preserva User/Business/Subscription/Payment (não apaga).
  const resetFn = businessReset.slice(
    businessReset.indexOf("export async function resetBusinessData"),
    businessReset.indexOf("export interface DeleteBusinessCounts"),
  );
  assert.ok(!/db\.user\.delete/.test(resetFn));
  assert.ok(!/db\.business\.delete/.test(resetFn));
  assert.ok(!/db\.subscription\.delete/.test(resetFn));
  assert.ok(!/db\.payment\.delete/.test(resetFn));
  // A exclusão TOTAL (deleteBusinessData) existe e remove empresa/usuários órfãos.
  assert.match(businessReset, /db\.business\.delete/);
  assert.match(businessReset, /db\.user\.delete/);
});

test("admin não-admin não consegue resetar (middleware de plataforma)", () => {
  // A rota de reset usa o middleware adminWrite = requirePlatformAdmin.
  assert.match(adminRoute, /\/businesses\/:id\/reset/);
  const resetIdx = adminRoute.indexOf("/businesses/:id/reset");
  assert.ok(resetIdx > -1);
  const segment = adminRoute.slice(resetIdx - 200, resetIdx + 800);
  assert.match(segment, /adminWrite/);
});

// ---------------------------------------------------------------------------
// PARTE 2 — /admin/users (plano da empresa + reset no modal)
// ---------------------------------------------------------------------------

test("admin/users: seletor de plano usa o MESMO endpoint de /admin/subscriptions", () => {
  // Caminho primário: troca de plano da assinatura já existente.
  assert.match(
    usersPage,
    /\/admin\/subscriptions\/\$\{sub\.id\}\/change-plan/,
  );
  // Fallback apenas quando a empresa não tem assinatura.
  assert.match(
    usersPage,
    /\/admin\/businesses\/\$\{businessId\}\/change-plan/,
  );
  assert.match(
    usersPage,
    /adminApi<AdminSubscription\[\]>\("\/admin\/subscriptions"\)/,
  );
  assert.match(usersPage, /Plano da empresa/);
});

test("admin/users: botão Resetar conta exige EXCLUIR no ConfirmModal", () => {
  assert.match(usersPage, /Resetar conta/);
  assert.match(
    usersPage,
    /\/admin\/businesses\/\$\{resetTarget\.businessId\}\/reset/,
  );
  assert.match(usersPage, /confirm: "EXCLUIR"/);
  assert.match(usersPage, /ConfirmModal/);
  assert.match(usersPage, /confirmText="EXCLUIR"/);
});

// ---------------------------------------------------------------------------
// PARTE 2 — Troca de plano por empresa (reuso da lógica de change-plan)
// ---------------------------------------------------------------------------

test("admin: troca de plano reutiliza changeSubscriptionPlan e NÃO muda status", () => {
  assert.match(adminRoute, /\/subscriptions\/:id\/change-plan/);
  assert.match(adminRoute, /changeSubscriptionPlan\(id, planId\)/);
  assert.match(adminRoute, /\/businesses\/:id\/change-plan/);
  assert.match(billing, /changeBusinessPlan/);
  assert.match(billing, /changeSubscriptionPlan\(subscription\.id, planId\)/);
  // changeSubscriptionPlan atualiza apenas plan_id/plan_name/plan_price —
  // nunca o status (ACTIVE continua ACTIVE, não vira PENDING_PAYMENT).
  const changePlanFn = billing.slice(
    billing.indexOf("changeSubscriptionPlan"),
    billing.indexOf("changeSubscriptionPlan") + 1200,
  );
  assert.match(changePlanFn, /plan_id: planId, plan_name: plan\.name, plan_price: price/);
  assert.ok(!/status: "PENDING_PAYMENT"/.test(changePlanFn));
  assert.ok(!/subscription\.create/.test(changePlanFn));
});

test("admin: criar assinatura via admin ATIVA a empresa (não fica PENDING_PAYMENT)", () => {
  assert.match(billing, /data: \{ status: "ACTIVE" \}/);
  assert.match(billing, /tx\.business\.update/);
  assert.match(billing, /data: \{ status: "ACTIVE" \}/);
});
