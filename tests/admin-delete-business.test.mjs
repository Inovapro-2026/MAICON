/**
 * ADMIN — excluir conta/tenant do banco.
 * DELETE /admin/businesses/:id apaga a empresa + todos os dados + contas de
 * usuário órfãs. Ação irreversível, restrita a PLATFORM_ADMIN.
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

const service = read("apps/api/src/services/business-reset.ts");
const route = read("apps/api/src/routes/admin.ts");
const page = read("apps/dashboard/app/admin/businesses/page.tsx");

test("admin: deleteBusinessData apaga empresa + dados + contas órfãs", () => {
  assert.match(service, /export async function deleteBusinessData/);
  assert.match(service, /db\.business\.delete\(\{ where: \{ id: businessId \} \}\)/);
  assert.match(service, /db\.businessMember\.deleteMany/);
  assert.match(service, /users_deleted/);
  assert.match(service, /platform_role === "NONE"/, "não apaga staff/admin da plataforma");
});

test("admin: rota DELETE /admin/businesses/:id existe e é restrita", () => {
  assert.match(route, /adminRouter\.delete\(/);
  assert.match(route, /"\/businesses\/:id"/);
  assert.match(route, /adminWrite/);
  assert.match(route, /deleteBusinessData/);
  assert.match(route, /admin\.business\.deleted/);
});

test("admin: UI tem botão 'Apagar' com dupla confirmação (EXCLUIR)", () => {
  assert.match(page, /Apagar/);
  assert.match(page, /deleteBusiness/);
  assert.match(page, /Digite EXCLUIR para confirmar/);
  assert.match(page, /EXCLUIR PERMANENTEMENTE/);
});
