import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  isImportedLeadSource,
  isBusinessOwnerOrAdmin,
  businessScope,
} from "@prospector/utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const deletionService = read("apps/api/src/services/deletion-service.ts");
const inboxRoute = read("apps/api/src/routes/inbox.ts");
const leadsRoute = read("apps/api/src/routes/leads.ts");
const emailsRoute = read("apps/api/src/routes/emails.ts");
const whatsappGroupsRoute = read("apps/api/src/routes/whatsapp-groups.ts");
const whatsappTab = read("apps/dashboard/components/prospect/whatsapp-tab.tsx");
const sidebar = read("apps/dashboard/components/layout/sidebar.tsx");
const bottomNav = read("apps/dashboard/components/layout/bottom-nav.tsx");
const inboxPage = read("apps/dashboard/app/(dashboard)/inbox/page.tsx");

// ---------------------------------------------------------------------------
// Política pura (escopo / permissão)
// ---------------------------------------------------------------------------

test("isImportedLeadSource: importados != MANUAL", () => {
  assert.equal(isImportedLeadSource("CSV"), true);
  assert.equal(isImportedLeadSource("XLSX"), true);
  assert.equal(isImportedLeadSource("PASTE"), true);
  assert.equal(isImportedLeadSource("TEST"), true);
  assert.equal(isImportedLeadSource("MANUAL"), false);
  assert.equal(isImportedLeadSource(null), false);
  assert.equal(isImportedLeadSource(undefined), false);
});

test("isBusinessOwnerOrAdmin: apenas OWNER/BUSINESS_ADMIN para ações em massa", () => {
  assert.equal(isBusinessOwnerOrAdmin("OWNER"), true);
  assert.equal(isBusinessOwnerOrAdmin("BUSINESS_ADMIN"), true);
  assert.equal(isBusinessOwnerOrAdmin("MANAGER"), false);
  assert.equal(isBusinessOwnerOrAdmin("AGENT"), false);
  assert.equal(isBusinessOwnerOrAdmin(undefined), false);
});

test("businessScope: toda exclusão carrega o business_id (isolamento multi-tenant)", () => {
  assert.deepEqual(businessScope("biz-1"), { business_id: "biz-1" });
});

// ---------------------------------------------------------------------------
// Invariantes do serviço de exclusão (segurança de dados de produção)
// ---------------------------------------------------------------------------

test("deletion-service: todas as exclusões são escopadas por business_id", () => {
  assert.ok(deletionService.includes("businessScope"), "usa o helper de escopo multi-tenant");
  assert.ok(deletionService.includes("business_id: businessId"));
  const deleteMentions = (deletionService.match(/deleteMany|delete\(/g) ?? []).length;
  const scoped = (deletionService.match(/business_id: businessId|where: scope/g) ?? []).length;
  assert.ok(scoped >= deleteMentions, `todo deleteMany/delete deve ter escopo (${scoped}/${deleteMentions})`);
});

test("deletion-service: não usa soft-delete (hard-delete documentado)", () => {
  assert.ok(!deletionService.includes("deleted_at"), "não deve usar coluna soft-delete");
  assert.ok(deletionService.includes("HARD-DELETE"));
});

test("deletion-service: toda ação registra em AuditLog", () => {
  const actions = [
    "conversation.deleted",
    "conversations.cleared",
    "leads.imported.cleared",
    "whatsapp_groups.leads_cleared",
    "whatsapp_groups.extraction_deleted",
  ];
  for (const action of actions) {
    assert.ok(deletionService.includes(action), `deve auditar ${action}`);
  }
});

test("deletion-service: excluir conversa remove Conversation + mensagens do lead", () => {
  assert.ok(deletionService.includes("db.message.deleteMany"));
  assert.ok(deletionService.includes("db.conversation.delete({ where: { id: conversationId } })"));
});

test("rotas: exclusão em massa restrita a OWNER/BUSINESS_ADMIN", () => {
  assert.ok(inboxRoute.includes("requireRole(['OWNER', 'BUSINESS_ADMIN'])"));
  assert.ok(leadsRoute.includes("requireRole(['OWNER', 'BUSINESS_ADMIN'])"));
});

test("rotas: DELETE /conversations e DELETE /leads/imported existem", () => {
  assert.ok(inboxRoute.includes("deleteAllConversations"));
  assert.ok(leadsRoute.includes("clearImportedLeads"));
});

test("extração WhatsApp: limpar leads é destrutivo, restrito e auditado", () => {
  assert.ok(
    whatsappGroupsRoute.includes('"/extractions/:id/leads"'),
    "rota DELETE de limpeza de leads da extração existe",
  );
  assert.ok(
    whatsappGroupsRoute.includes('requireRole(["OWNER", "BUSINESS_ADMIN"])'),
    "restrita a OWNER/BUSINESS_ADMIN",
  );
  assert.ok(
    whatsappGroupsRoute.includes("clearWhatsAppExtractionLeads"),
    "delega a exclusão central (isolamento multi-tenant + auditoria)",
  );
});

test("extração WhatsApp: excluir extração é destrutivo, restrito e auditado", () => {
  assert.ok(
    whatsappGroupsRoute.includes('whatsappGroupsRouter.delete(') &&
      whatsappGroupsRoute.includes('"/extractions/:id",'),
    "rota DELETE de exclusão da extração existe",
  );
  assert.ok(
    whatsappGroupsRoute.includes(
      "deleteWhatsAppExtraction(businessId, req.params.id",
    ),
    "delega a exclusão central (isolamento multi-tenant + auditoria)",
  );
  assert.ok(
    deletionService.includes("whatsAppGroupExtraction.deleteMany"),
    "remove o registro de histórico",
  );
  assert.ok(
    deletionService.includes("whatsAppGroupSource.deleteMany"),
    "remove as fontes da extração",
  );
  assert.ok(
    deletionService.includes(
      "Não é possível excluir a extração enquanto ela está em andamento."
    ),
    "bloqueia exclusão de extração em andamento",
  );
});

test("extração WhatsApp: UI exige confirmação reforçada antes de limpar leads", () => {
  assert.ok(whatsappTab.includes('confirmText="EXCLUIR"'), "exige digitar EXCLUIR");
  assert.ok(whatsappTab.includes('"Limpar leads"'), 'botão "Limpar leads" existe');
  assert.ok(
    whatsappTab.includes("whatsapp/groups/extractions/${selectedExtraction.id}/leads"),
    "chama o endpoint de limpeza",
  );
  assert.ok(
    whatsappTab.includes("queryClient.invalidateQueries"),
    "invalida a lista ao limpar",
  );
});

test("extração WhatsApp: UI tem excluir por linha (ao lado de Ver) com confirmação", () => {
  assert.ok(whatsappTab.includes('<Trash2 className="h-3.5 w-3.5" /> Excluir'));
  assert.ok(whatsappTab.includes("setDeleteTarget(ext)"));
  assert.ok(
    whatsappTab.includes("whatsapp/groups/extractions/${deleteTarget.id}"),
    "chama o endpoint de exclusão da extração",
  );
  assert.ok(
    whatsappTab.includes("setDeleteTarget(null)"),
    "fecha o modal ao excluir",
  );
});

test("rotas de e-mails: isoladas por business_id (multi-tenant)", () => {
  assert.ok(emailsRoute.includes("business_id: businessId"));
});

// ---------------------------------------------------------------------------
// Renomeação "Inbox" -> "Mensagens" (apenas texto visível ao usuário)
// ---------------------------------------------------------------------------

test("UI: menu lateral e título usam 'Mensagens', rota continua /inbox", () => {
  assert.ok(sidebar.includes('label: "Mensagens"'));
  assert.ok(bottomNav.includes('label: "Mensagens"'));
  assert.ok(inboxPage.includes('DashboardShell title="Mensagens"'));
  assert.ok(sidebar.includes('href: "/inbox"'), "rota interna não deve ser renomeada");
  assert.ok(bottomNav.includes('href: "/inbox"'), "rota interna não deve ser renomeada");
});

// ---------------------------------------------------------------------------
// Estilo centralizado (tokens únicos, sem estilo isolado por tela)
// ---------------------------------------------------------------------------

test("UI: tokens centralizados heading-strong e divider-fluorescent existem", () => {
  const globals = read("apps/dashboard/app/globals.css");
  assert.ok(globals.includes(".heading-strong"));
  assert.ok(globals.includes(".divider-fluorescent"));
  assert.ok(globals.includes("var(--foreground)") || globals.includes("--foreground"));
  const topbar = read("apps/dashboard/components/layout/topbar.tsx");
  assert.ok(topbar.includes("heading-strong"), "topbar usa o token central de título");
  assert.ok(sidebar.includes("divider-fluorescent"), "sidebar usa divisores fluorescentes");
});

// ---------------------------------------------------------------------------
// Privacidade: metadados de IA ocultos do frontend
// ---------------------------------------------------------------------------

test("UI: metadados de modelo/tokens/latência/provedor ocultos do frontend", () => {
  const playground = read("apps/dashboard/app/(dashboard)/ai/playground/page.tsx");
  assert.ok(!playground.includes("tokens in"), "não deve exibir 'tokens in'");
  assert.ok(!playground.includes("latência"), "não deve exibir 'latência'");
  assert.ok(!playground.includes("result.provider"), "não deve exibir provider no resultado");
  assert.ok(!playground.includes("result.model"), "não deve exibir modelo no resultado");
});
