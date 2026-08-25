"use client";

import { useEffect, useState } from "react";
import { Crown, CreditCard, CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import { DashboardShell } from "@/components/layout/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useApi, request } from "@/hooks/use-api";

interface BillingStatus {
  business: { id: string; name: string; slug: string; status: string };
  subscription: {
    status: string;
    plan_name: string | null;
    plan_price: number | null;
    expires_at: string | null;
    is_expired: boolean;
    cakto_checkout_url: string | null;
  } | null;
  requires_payment: boolean;
  is_expired: boolean;
  cakto_configured: boolean;
}

function useCountdown(target: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  if (!target) return "";
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return "Expirado";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return `Faltam ${days} dia${days === 1 ? "" : "s"} e ${hours}h para renovar`;
}

export default function PlanosPage() {
  const { success, error: toastError } = useToast();
  const status = useApi<BillingStatus>(["billing-status"], "billing/status");
  const [renewing, setRenewing] = useState(false);

  const data = status.data;
  const sub = data?.subscription ?? null;
  const expired = Boolean(data?.is_expired || sub?.is_expired);
  const active = Boolean(sub && sub.status === "ACTIVE" && !expired);

  const renew = async () => {
    setRenewing(true);
    try {
      const res = await request<{ url: string }>("billing/checkout", { method: "POST", body: {} });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        toastError("Não foi possível gerar o link de pagamento.");
      }
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Falha ao gerar o pagamento");
    } finally {
      setRenewing(false);
    }
  };

  const countdown = useCountdown(sub?.expires_at ?? null);

  const formattedExpiry = sub?.expires_at
    ? new Date(sub.expires_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

  return (
    <DashboardShell title="Planos">
      <div className="mb-6">
        <h1 className="heading-strong text-xl">Planos</h1>
        <p className="text-sm text-zinc-500">Gerencie sua assinatura e renovação</p>
      </div>

      <div className="mx-auto max-w-xl">
        <Card className="overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-violet-500 to-blue-500" />
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                <Crown className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-zinc-500">Plano ativo</div>
                <div className="text-xl font-bold text-zinc-900">
                  {sub?.plan_name ?? "SAVYRON Profissional"}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {active ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-600">
                  <XCircle className="h-3.5 w-3.5" /> Expirado
                </span>
              )}
              {sub?.plan_price ? (
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600">
                  R$ {sub.plan_price.toFixed(2).replace(".", ",")}
                  {sub.plan_name?.toLowerCase().includes("mensal") ? "" : "/mês"}
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
                <CalendarClock className="h-5 w-5 shrink-0 text-zinc-500" />
                <div>
                  <div className="text-xs text-zinc-500">Renovação em</div>
                  <div className="font-semibold text-zinc-900">{formattedExpiry}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
                <CreditCard className="h-5 w-5 shrink-0 text-zinc-500" />
                <div>
                  <div className="text-xs text-zinc-500">Status do período</div>
                  <div className={`font-semibold ${expired ? "text-red-600" : "text-emerald-600"}`}>
                    {countdown || "—"}
                  </div>
                </div>
              </div>
            </div>

            {expired ? (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
                Seu plano expirou. Para continuar usando o SAVYRON e não perder suas
                campanhas e dados, renove sua assinatura agora.
              </div>
            ) : null}

            <Button onClick={() => void renew()} loading={renewing} className="mt-5 w-full">
              <CreditCard className="mr-2 h-4 w-4" />
              {expired ? "Renovar Assinatura" : "Gerenciar Pagamento"}
            </Button>
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              O pagamento é feito com segurança (PIX recorrente ou cartão). O acesso é
              renovado automaticamente após a confirmação.
            </p>
          </div>
        </Card>

        {!status.isLoading && !sub ? (
          <Card className="mt-4 p-6 text-center text-sm text-zinc-500">
            Nenhuma assinatura ativa encontrada para esta empresa.
          </Card>
        ) : null}
      </div>
    </DashboardShell>
  );
}
