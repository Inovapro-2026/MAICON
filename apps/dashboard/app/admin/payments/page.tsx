"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, AdminPayment } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/admin/status-badge";

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reconciling, setReconciling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const r = await adminApi<{ payments: AdminPayment[]; total: number }>(
        `/admin/payments${qs ? `?${qs}` : ""}`,
      );
      setPayments(r.payments);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar pagamentos");
    } finally {
      setLoading(false);
    }
  }, [status, q, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const reconcile = async (id: string) => {
    setReconciling(id);
    setError(null);
    try {
      const r = await adminApi<{
        payment: AdminPayment | null;
        gateway_status: string;
      }>(`/admin/payments/${id}/reconcile`, "POST", {});
      await load();
      const s = r?.payment?.status ?? "";
      window.alert(`Gateway: ${r.gateway_status} → local: ${s}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao reconciliar");
    } finally {
      setReconciling(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="heading-strong text-xl">
            Pagamentos
          </h1>
          <p className="text-sm text-zinc-500">
            Cobranças registradas via gateway (Stripe)
          </p>
        </div>
        <Card className="p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="PENDING">PENDING</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="RECEIVED">RECEIVED</option>
                <option value="OVERDUE">OVERDUE</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="REFUNDED">REFUNDED</option>
              </select>
            </div>
            <div>
              <label className="label">Empresa</label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="nome ou slug"
              />
            </div>
            <div>
              <label className="label">De</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Até</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => void load()}>Filtrar</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStatus("");
                  setQ("");
                  setFrom("");
                  setTo("");
                }}
              >
                Limpar
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <>
          <div className="text-xs text-zinc-500">
            {total} pagamento{total === 1 ? "" : "s"}
          </div>
          <div className="space-y-2">
            {payments.map((p) => (
              <Card
                key={p.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">
                      {p.business?.name ?? "—"}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {p.method} · {brl(p.value)} ·{" "}
                    {new Date(p.created_at).toLocaleString("pt-BR")}
                    {p.paid_at
                      ? ` · pago em ${new Date(p.paid_at).toLocaleDateString("pt-BR")}`
                      : ""}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {p.subscription?.plan_name
                      ? `Plano: ${p.subscription.plan_name} · `
                      : ""}
                    {p.stripe_payment_intent_id
                      ? `Stripe: ${p.stripe_payment_intent_id}`
                      : p.stripe_checkout_session_id
                        ? `Stripe session: ${p.stripe_checkout_session_id}`
                        : "sem gateway"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.stripe_payment_intent_id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void reconcile(p.id)}
                      loading={reconciling === p.id}
                    >
                      Reconciliar
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
            {payments.length === 0 && (
              <div className="text-sm text-zinc-500">Nenhum pagamento.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
