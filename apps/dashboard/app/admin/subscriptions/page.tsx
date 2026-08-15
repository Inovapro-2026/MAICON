"use client";

import { useEffect, useState } from "react";
import {
  adminApi,
  AdminSubscription,
  AdminSubscriptionDetail,
  AdminPlan,
} from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/admin/status-badge";

const brl = (n: number | null) =>
  n != null
    ? `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : "—";

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<AdminSubscription[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminSubscription | null>(null);
  const [detail, setDetail] = useState<AdminSubscriptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const subsResult = await adminApi<AdminSubscription[]>(
        "/admin/subscriptions",
      );
      setSubs(subsResult);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao carregar assinaturas",
      );
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

  useEffect(() => {
    void load();
    void loadPlans();
  }, []);

  const openDetail = async (s: AdminSubscription) => {
    setSelected(s);
    setDetail(null);
    setDetailLoading(true);
    setError(null);
    setNewPlanId("");
    try {
      const d = await adminApi<AdminSubscriptionDetail>(
        `/admin/subscriptions/${s.id}`,
      );
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar detalhe");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!selected) return;
    try {
      const d = await adminApi<AdminSubscriptionDetail>(
        `/admin/subscriptions/${selected.id}`,
      );
      setDetail(d);
    } catch {
      /* noop */
    }
    await load();
  };

  const changePlan = async () => {
    if (!selected || !newPlanId) return;
    setActing(true);
    setError(null);
    try {
      await adminApi(
        `/admin/subscriptions/${selected.id}/change-plan`,
        "POST",
        { plan_id: newPlanId },
      );
      await refreshDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao mudar plano");
    } finally {
      setActing(false);
    }
  };

  const cancelSub = async () => {
    if (!selected) return;
    if (
      !window.confirm(
        "Cancelar esta assinatura? A cobrança também é cancelada no Stripe.",
      )
    )
      return;
    setActing(true);
    setError(null);
    try {
      await adminApi(`/admin/subscriptions/${selected.id}/cancel`, "POST", {});
      await refreshDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cancelar");
    } finally {
      setActing(false);
    }
  };

  const reactivateSub = async () => {
    if (!selected) return;
    if (!window.confirm("Reativar esta assinatura?")) return;
    setActing(true);
    setError(null);
    try {
      await adminApi(
        `/admin/subscriptions/${selected.id}/reactivate`,
        "POST",
        {},
      );
      await refreshDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao reativar");
    } finally {
      setActing(false);
    }
  };

  const canCancel = detail && detail.status !== "CANCELLED";
  const canReactivate =
    detail && (detail.status === "CANCELLED" || detail.status === "EXPIRED");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-strong text-xl">
          Assinaturas
        </h1>
        <p className="text-sm text-zinc-500">
          Todas as assinaturas da plataforma
        </p>
      </div>
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {subs.map((s) => (
            <button
              key={s.id}
              onClick={() => void openDetail(s)}
              className="block w-full text-left"
            >
              <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">
                      {s.business?.name ?? s.business_id}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {s.plan_name ?? "—"} · {brl(s.plan_price)}
                    {s.current_period_end
                      ? ` · até ${new Date(s.current_period_end).toLocaleDateString("pt-BR")}`
                      : ""}
                    {s._count?.payments
                      ? ` · ${s._count.payments} pagamentos`
                      : ""}
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  {s.stripe_subscription_id
                    ? `Stripe: ${s.stripe_subscription_id}`
                    : "sem assinatura Stripe"}
                </div>
              </Card>
            </button>
          ))}
          {subs.length === 0 && (
            <div className="text-sm text-zinc-500">Nenhuma assinatura.</div>
          )}
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `Assinatura — ${selected.business?.name ?? selected.id}`
            : "Assinatura"
        }
        footer={
          <div className="flex flex-wrap gap-2">
            {canCancel ? (
              <Button
                variant="danger"
                onClick={() => void cancelSub()}
                loading={acting}
              >
                Cancelar
              </Button>
            ) : null}
            {canReactivate ? (
              <Button
                variant="primary"
                onClick={() => void reactivateSub()}
                loading={acting}
              >
                Reativar
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setSelected(null)}>
              Fechar
            </Button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="text-sm text-zinc-500">Carregando...</div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-zinc-500">Empresa</div>
                <div className="text-zinc-700">
                  {detail.business?.name ?? "—"}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {detail.business?.slug} ·{" "}
                  <StatusBadge status={detail.business?.status ?? ""} />
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Plano</div>
                <div className="text-zinc-700">
                  {detail.plan?.name ?? detail.plan_name ?? "—"} ·{" "}
                  {brl(detail.plan_price)}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {detail.plan?.description ?? ""}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-zinc-500">Status</div>
                <StatusBadge status={detail.status} />
              </div>
              <div>
                <div className="text-xs text-zinc-500">Período atual</div>
                <div className="text-zinc-700">
                  {detail.current_period_start
                    ? new Date(detail.current_period_start).toLocaleDateString(
                        "pt-BR",
                      )
                    : "—"}{" "}
                  →{" "}
                  {detail.current_period_end
                    ? new Date(detail.current_period_end).toLocaleDateString(
                        "pt-BR",
                      )
                    : "—"}
                </div>
              </div>
            </div>

            <div className="space-y-1 rounded-lg bg-white px-3 py-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-zinc-500">stripeCustomerId</span>
                <code className="text-zinc-700">
                  {detail.stripe_customer_id ?? "—"}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">stripeSubscriptionId</span>
                <code className="text-zinc-700">
                  {detail.stripe_subscription_id ?? "—"}
                </code>
              </div>
              {detail.stripe_price_id ? (
                <div className="flex justify-between">
                  <span className="text-zinc-500">stripePriceId</span>
                  <code className="text-zinc-700">
                    {detail.stripe_price_id}
                  </code>
                </div>
              ) : null}
              {detail.trial_ends_at ? (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Trial até</span>
                  <code className="text-zinc-700">
                    {new Date(detail.trial_ends_at).toLocaleDateString("pt-BR")}
                  </code>
                </div>
              ) : null}
              {detail.cancelled_at ? (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Cancelada em</span>
                  <code className="text-zinc-700">
                    {new Date(detail.cancelled_at).toLocaleDateString("pt-BR")}
                  </code>
                </div>
              ) : null}
            </div>

            {canCancel || canReactivate ? (
              <div className="flex items-end gap-2 rounded-lg border border-zinc-200 p-3">
                <div className="flex-1">
                  <label className="label">Mudar para o plano</label>
                  <select
                    className="input"
                    value={newPlanId}
                    onChange={(e) => setNewPlanId(e.target.value)}
                  >
                    <option value="">Manter plano atual</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {brl(p.price)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void changePlan()}
                  loading={acting}
                  disabled={!newPlanId}
                >
                  Aplicar
                </Button>
              </div>
            ) : null}

            <div>
              <div className="mb-2 text-sm font-medium text-zinc-700">
                Histórico de pagamentos
              </div>
              {detail.payments.length === 0 ? (
                <div className="text-xs text-zinc-500">
                  Nenhum pagamento registrado.
                </div>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                  {detail.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                    >
                      <div className="text-xs">
                        <StatusBadge status={p.status} />
                        <span className="ml-2 text-zinc-700">
                          {p.method} · {brl(p.value)}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                        {p.stripe_payment_intent_id
                          ? ` · ${p.stripe_payment_intent_id}`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
