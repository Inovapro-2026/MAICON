"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, AdminBusiness, setSessionToken } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_STYLES: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  TRIAL: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  ACTIVE: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  PAST_DUE: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  SUSPENDED: "bg-red-500/15 text-red-600 border-red-500/30",
  CANCELLED: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
};

export default function AdminBusinessesPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const result = await adminApi<AdminBusiness[]>(
        `/admin/businesses${query}`,
      );
      setBusinesses(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar empresas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeStatus = async (id: string, status: string) => {
    if (!window.confirm(`Alterar status da empresa para ${status}?`)) return;
    try {
      await adminApi(`/admin/businesses/${id}/status`, "POST", { status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao alterar status");
    }
  };

  const impersonate = async (id: string) => {
    if (impersonating !== id) return;
    try {
      const result = await adminApi<{ token: string }>(
        "/admin/impersonate",
        "POST",
        { business_id: id, reason: reason.trim() },
      );
      await setSessionToken(result.token);
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar suporte");
      setImpersonating(null);
    }
  };

  const deleteBusiness = async (id: string, name: string) => {
    const ok = window.confirm(
      `EXCLUIR PERMANENTEMENTE a conta "${name}"? Esta ação remove TODOS os dados da empresa e do banco de dados e NÃO pode ser desfeita. Digite EXCLUIR para confirmar.`,
    );
    if (!ok) return;
    const typed = window.prompt("Digite EXCLUIR para confirmar a exclusão:");
    if (typed !== "EXCLUIR") {
      setError("Exclusão cancelada — digite EXCLUIR para confirmar.");
      return;
    }
    try {
      const result = await adminApi<{ deleted: boolean; users_deleted?: number }>(
        `/admin/businesses/${id}`,
        "DELETE",
      );
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir empresa");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="heading-strong text-xl">
            Empresas
          </h1>
          <p className="text-sm text-zinc-500">
            Gerencie tenants da plataforma
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome/slug/e-mail..."
            className="w-64"
          />
          <Button onClick={() => void load()}>Buscar</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <div className="space-y-3">
          {businesses.map((b) => (
            <Card key={b.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">{b.name}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLES[b.status] ?? ""}`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {b.email || "sem e-mail"} · slug: {b.slug}
                    {b.segment ? ` · ${b.segment}` : ""}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    Contatos {b._count.leads} · Conversas{" "}
                    {b._count.conversations} · Mensagens {b._count.messages} ·
                    Usuários {b._count.members}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {b.status !== "SUSPENDED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => changeStatus(b.id, "SUSPENDED")}
                    >
                      Suspender
                    </Button>
                  )}
                  {b.status === "SUSPENDED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => changeStatus(b.id, "ACTIVE")}
                    >
                      Reativar
                    </Button>
                  )}
                  {b.status !== "CANCELLED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => changeStatus(b.id, "CANCELLED")}
                    >
                      Cancelar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      setImpersonating(impersonating === b.id ? null : b.id)
                    }
                  >
                    Suporte
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void deleteBusiness(b.id, b.name)}
                  >
                    Apagar
                  </Button>
                </div>
              </div>
              {impersonating === b.id && (
                <div className="mt-3 border-t border-zinc-200 pt-3">
                  <p className="mb-2 text-xs text-zinc-500">
                    Acessar como {b.name} (sessão auditável, sem revelar senha).
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Motivo do suporte (opcional)"
                      className="flex-1"
                    />
                    <Button size="sm" onClick={() => void impersonate(b.id)}>
                      Entrar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setImpersonating(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
          {businesses.length === 0 && (
            <div className="text-sm text-zinc-500">
              Nenhuma empresa encontrada.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
