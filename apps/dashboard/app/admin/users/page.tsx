"use client";

import { useEffect, useState } from "react";
import {
  adminApi,
  AdminUser,
  AdminUserDetail,
  AdminPlan,
  AdminSubscription,
} from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { StatusBadge } from "@/components/admin/status-badge";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // planos + assinaturas (para gerir o plano de cada empresa no modal)
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [subs, setSubs] = useState<AdminSubscription[]>([]);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<Record<string, string>>({});
  const [resetTarget, setResetTarget] = useState<{
    businessId: string;
    name: string;
  } | null>(null);
  const [resetting, setResetting] = useState(false);

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAdmin, setNewAdmin] = useState(false);
  const [creating, setCreating] = useState(false);

  // edit fields
  const [role, setRole] = useState<
    "NONE" | "PLATFORM_STAFF" | "PLATFORM_ADMIN"
  >("NONE");
  const [active, setActive] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminApi<{ users: AdminUser[] }>("/admin/users");
      setUsers(r.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const r = await adminApi<{ plans: AdminPlan[] }>("/admin/plans");
      setPlans(r.plans);
    } catch {
      /* não bloqueia */
    }
  };

  const loadSubs = async () => {
    try {
      const r = await adminApi<AdminSubscription[]>("/admin/subscriptions");
      setSubs(r);
    } catch {
      /* não bloqueia */
    }
  };

  useEffect(() => {
    void load();
    void loadPlans();
    void loadSubs();
  }, []);

  const changePlan = async (businessId: string, planId: string) => {
    if (!planId) return;
    setChangingPlan(businessId);
    setError(null);
    try {
      // Usa o MESMO endpoint canônico de troca de plano de /admin/subscriptions
      // (mantém o status atual da assinatura — ACTIVE continua ACTIVE). Apenas
      // quando a empresa não tem assinatura cai no endpoint administrativo que
      // cria a assinatura e ativa a empresa.
      const sub = subs.find((s) => s.business_id === businessId);
      if (sub) {
        await adminApi(`/admin/subscriptions/${sub.id}/change-plan`, "POST", {
          plan_id: planId,
        });
      } else {
        await adminApi(`/admin/businesses/${businessId}/change-plan`, "POST", {
          plan_id: planId,
        });
      }
      await loadSubs();
      setPendingPlan((p) => ({ ...p, [businessId]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao trocar plano");
    } finally {
      setChangingPlan(null);
    }
  };

  const resetBusiness = async () => {
    if (!resetTarget) return;
    setResetting(true);
    setError(null);
    try {
      const r = await adminApi<{
        leads: number;
        messages: number;
        conversations: number;
        campaigns: number;
        prospections: number;
        jobs_removed: number;
      }>(
        `/admin/businesses/${resetTarget.businessId}/reset`,
        "POST",
        { confirm: "EXCLUIR" },
      );
      window.alert(
        `Empresa "${resetTarget.name}" resetada:\n• ${r.leads} leads\n• ${r.messages} mensagens\n• ${r.conversations} conversas\n• ${r.campaigns} campanhas\n• ${r.prospections} prospecções\n• ${r.jobs_removed} jobs removidos das filas`,
      );
      setResetTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao resetar conta");
    } finally {
      setResetting(false);
    }
  };

  const openDetail = async (u: AdminUser) => {
    setSelected(u);
    setRole(u.platform_role as "NONE" | "PLATFORM_STAFF" | "PLATFORM_ADMIN");
    setActive(u.active);
    setDetail(null);
    setDetailLoading(true);
    setError(null);
    try {
      const r = await adminApi<{ user: AdminUserDetail }>(
        `/admin/users/${u.id}`,
      );
      setDetail(r.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar detalhes");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveUser = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi(`/admin/users/${selected.id}`, "PATCH", {
        platform_role: role,
        active,
      });
      await load();
      await openDetail(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await adminApi("/admin/users", "POST", {
        name: newName,
        email: newEmail,
        password: newPassword,
        platform_role: newAdmin ? "PLATFORM_ADMIN" : "NONE",
      });
      setShowCreate(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewAdmin(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="heading-strong text-xl">
            Usuários
          </h1>
          <p className="text-sm text-zinc-500">
            Contas cadastradas na plataforma
          </p>
        </div>
        <Button onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? "Cancelar" : "Novo usuário"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {showCreate && (
        <Card className="p-4">
          <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Nome"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <Input
              label="E-mail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <Input
              label="Senha"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={newAdmin}
                onChange={(e) => setNewAdmin(e.target.checked)}
                className="accent-emerald-500"
              />
              Administrador da plataforma
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" loading={creating}>
                Criar usuário
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => void openDetail(u)}
              className="block w-full text-left"
            >
              <Card className="flex items-center justify-between p-4 transition-colors hover:border-zinc-400">
                <div>
                  <div className="font-medium text-zinc-900">{u.name}</div>
                  <div className="text-xs text-zinc-500">
                    {u.email} · criado em{" "}
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!u.active ? (
                    <span className="rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-600">
                      desativada
                    </span>
                  ) : null}
                  <StatusBadge status={u.platform_role} />
                </div>
              </Card>
            </button>
          ))}
          {users.length === 0 && (
            <div className="text-sm text-zinc-500">Nenhum usuário.</div>
          )}
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={
          selected ? `Editar usuário — ${selected.name}` : "Editar usuário"
        }
        footer={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>
              Fechar
            </Button>
            <Button onClick={() => void saveUser()} loading={saving}>
              Salvar alterações
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {detailLoading ? (
            <div className="text-sm text-zinc-500">Carregando...</div>
          ) : (
            detail && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-zinc-500">E-mail</div>
                    <div className="text-zinc-700">{detail.email}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Criado em</div>
                    <div className="text-zinc-700">
                      {new Date(detail.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Papel na plataforma</label>
                    <select
                      className="input"
                      value={role}
                      onChange={(e) => setRole(e.target.value as typeof role)}
                    >
                      <option value="NONE">NONE — usuário comum</option>
                      <option value="PLATFORM_STAFF">
                        PLATFORM_STAFF — suporte (leitura)
                      </option>
                      <option value="PLATFORM_ADMIN">
                        PLATFORM_ADMIN — administrador
                      </option>
                    </select>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {selected?.id && role !== selected.platform_role ? (
                        <>
                          Atenção: você não pode se rebaixar se for o último
                          admin. A alteração é auditada.
                        </>
                      ) : (
                        "Alteração registrada em auditoria."
                      )}
                    </p>
                  </div>
                  <div>
                    <label className="label">Status da conta</label>
                    <div className="flex items-center gap-3 pt-2">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                        className="accent-emerald-500"
                      />
                      <span className="text-sm text-zinc-700">
                        {active ? "Ativa" : "Desativada"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Conta desativada não consegue entrar na plataforma.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-medium text-zinc-700">
                    Empresas do usuário
                  </div>
                  {detail.memberships.length === 0 ? (
                    <div className="text-xs text-zinc-500">
                      Nenhuma empresa vinculada.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {detail.memberships.map((m) => {
                        const sub = subs.find(
                          (s) => s.business_id === m.business.id,
                        );
                        const currentPlan = plans.find(
                          (p) => p.name === sub?.plan_name,
                        );
                        return (
                          <div
                            key={m.id}
                            className="rounded-lg bg-white px-3 py-2"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm text-zinc-700">
                                  {m.business.name}
                                </span>
                                <span className="ml-2 text-[11px] text-zinc-500">
                                  {m.business.slug}
                                </span>
                              </div>
                              <StatusBadge status={m.role} />
                            </div>
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                              <div className="min-w-[220px] flex-1">
                                <label className="label">
                                  Plano da empresa
                                </label>
                                <div className="flex items-center gap-2">
                                  <select
                                    className="input"
                                    value={
                                      pendingPlan[m.business.id] ??
                                      currentPlan?.id ??
                                      ""
                                    }
                                    disabled={
                                      changingPlan === m.business.id ||
                                      plans.length === 0
                                    }
                                    onChange={(e) =>
                                      setPendingPlan((p) => ({
                                        ...p,
                                        [m.business.id]: e.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">Sem plano</option>
                                    {plans.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name} — R${" "}
                                        {p.price.toFixed(2).replace(".", ",")}
                                      </option>
                                    ))}
                                  </select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0"
                                    disabled={
                                      !pendingPlan[m.business.id] ||
                                      pendingPlan[m.business.id] ===
                                        (currentPlan?.id ?? "") ||
                                      changingPlan === m.business.id
                                    }
                                    loading={changingPlan === m.business.id}
                                    onClick={() =>
                                      void changePlan(
                                        m.business.id,
                                        pendingPlan[m.business.id],
                                      )
                                    }
                                  >
                                    Aplicar
                                  </Button>
                                </div>
                                <p className="mt-1 text-[11px] text-zinc-400">
                                  Selecione o plano e clique em Aplicar para
                                  trocar imediatamente.
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  setResetTarget({
                                    businessId: m.business.id,
                                    name: m.business.name,
                                  })
                                }
                              >
                                Resetar conta
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(resetTarget)}
        title="Resetar conta da empresa"
        confirmText="EXCLUIR"
        confirmLabel="Resetar"
        loading={resetting}
        onCancel={() => setResetTarget(null)}
        onConfirm={() => void resetBusiness()}
        message={
          <span>
            Resetar todos os dados da empresa{" "}
            <strong className="text-zinc-900">
              {resetTarget?.name}
            </strong>
            ? Leads, campanhas, conversas, mensagens, opt-outs, eventos e
            gerações de IA desta empresa serão{" "}
            <strong className="text-red-600">
              apagados permanentemente
            </strong>
            . A conta de login e a empresa continuam existindo. A sessão do
            WhatsApp será encerrada e jobs pendentes serão removidos. Digite{" "}
            <strong className="text-zinc-900">EXCLUIR</strong> para confirmar.
          </span>
        }
      />
    </div>
  );
}
