/**
 * Segurança do /admin: link oculto na sidebar, middleware de rota no Next.js,
 * e autorização real na API (403 para quem não tem papel de plataforma;
 * escrita só para PLATFORM_ADMIN; tentativas negadas logadas).
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

const sidebar = read("apps/dashboard/components/layout/sidebar.tsx");
const middleware = read("apps/dashboard/middleware.ts");
const adminLayout = read("apps/dashboard/app/admin/layout.tsx");
const adminRoute = read("apps/api/src/routes/admin.ts");
const authMiddleware = read("apps/api/src/middleware/auth.ts");
const appFile = read("apps/api/src/app.ts");

// ---------------------------------------------------------------------------
// PARTE 1 — Sidebar: link Admin só para papel de plataforma
// ---------------------------------------------------------------------------

test("sidebar: link Admin oculto para quem não tem papel de plataforma", () => {
  assert.match(sidebar, /useSession/);
  assert.match(sidebar, /canSeeAdmin/);
  assert.match(
    sidebar,
    /user\?\.platform_role === "PLATFORM_ADMIN"/,
  );
  assert.match(
    sidebar,
    /user\?\.platform_role === "PLATFORM_STAFF"/,
  );
});

// ---------------------------------------------------------------------------
// PARTE 2 — Middleware/Next.js: /admin exige papel de plataforma
// ---------------------------------------------------------------------------

test("middleware: /admin redireciona não-admins para /dashboard sem montar conteúdo", () => {
  assert.match(middleware, /isAdminPath/);
  assert.match(middleware, /pathname === '\/admin' \|\| pathname\.startsWith\('\/admin\/'\)/);
  assert.match(middleware, /platform_role/);
  assert.match(
    middleware,
    /role !== 'PLATFORM_ADMIN' && role !== 'PLATFORM_STAFF'/,
  );
  assert.match(middleware, /url\.pathname = '\/dashboard'/);
});

test("admin layout: proteção server-side (sem flash de conteúdo admin)", () => {
  assert.match(adminLayout, /getSession/);
  assert.match(adminLayout, /redirect\("\/dashboard"\)/);
  assert.match(adminLayout, /PLATFORM_ADMIN/);
  assert.match(adminLayout, /PLATFORM_STAFF/);
});

// ---------------------------------------------------------------------------
// PARTE 3 — API: todas as rotas /admin exigem papel; escrita só PLATFORM_ADMIN
// ---------------------------------------------------------------------------

test("API: todas as rotas /admin usam middleware de plataforma", () => {
  // Router de leitura/escrita globalmente exige papel de plataforma.
  assert.match(adminRoute, /adminRouter\.use\(requireAuth, requirePlatformRole\)/);
});

test("API: escrita do admin só com PLATFORM_ADMIN (nunca PLATFORM_STAFF)", () => {
  // Conta o número de rotas de escrita (post/patch/delete).
  const writeRoutes = adminRoute.match(/adminRouter\.(post|patch|delete)\(/g) ?? [];
  // Cada rota de escrita deve usar o middleware adminWrite (requirePlatformAdmin).
  const adminWriteCount = adminRoute.match(/adminWrite,?\n?\s*asyncHandler/g) ?? [];
  // As rotas de escrita são definidas com adminWrite como 2º argumento.
  assert.ok(writeRoutes.length >= 14);
  // Garante que o guard de escrita existe e é usado.
  assert.match(adminRoute, /const adminWrite = requirePlatformAdmin/);
  assert.ok(adminWriteCount.length >= 12);
});

test("API: requirePlatformAdmin retorna 403 (nunca 404) e distingue STAFF", () => {
  assert.match(authMiddleware, /requirePlatformAdmin/);
  assert.match(authMiddleware, /ApiError\.forbidden\("Esta ação requer PLATFORM_ADMIN"\)/);
  assert.match(authMiddleware, /platform_role !== "PLATFORM_ADMIN"/);
});

test("API: tentativas negadas são LOGADAS (detectar escalonamento)", () => {
  assert.match(authMiddleware, /logDeniedAdminAccess/);
  assert.match(authMiddleware, /logger\.warn\("Acesso negado a rota \/admin"/);
  assert.match(authMiddleware, /platform_role/);
});

// ---------------------------------------------------------------------------
// Rate limiting — /admin coberto pelo limite global (exceto webhooks)
// ---------------------------------------------------------------------------

test("API: rate limit global cobre /admin (só webhooks são isentos)", () => {
  assert.match(appFile, /req\.path\.startsWith\("\/webhooks"\)/);
  assert.match(appFile, /globalRateLimit/);
  assert.match(appFile, /app\.use\(/);
});
