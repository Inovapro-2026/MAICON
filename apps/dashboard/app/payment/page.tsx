"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface BillingStatus {
  business: { id: string; name: string; status: string };
  subscription: {
    id: string;
    status: string;
    plan_name: string | null;
    plan_price: number | null;
    current_period_end: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    cakto_checkout_url: string | null;
  } | null;
  last_payment: {
    id: string;
    method: string;
    status: string;
    value: number;
    stripe_payment_intent_id: string | null;
    cakto_order_id: string | null;
  } | null;
  requires_payment: boolean;
  stripe_configured: boolean;
  stripe_publishable_key: string | null;
  cakto_configured: boolean;
}

interface StripeCheckout {
  url: string;
  paymentId: string;
  amount: number;
  priceId: string;
}

interface ApiInit {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers:
      init.body !== undefined
        ? { "Content-Type": "application/json" }
        : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (!res.ok || !data.success) {
    throw new Error(data?.error?.message ?? "Erro na requisição");
  }
  return data.data as T;
}

type Mode = "loading" | "pay" | "paid";

export default function PaymentPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingCheckout, setStartingCheckout] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [checkingNow, setCheckingNow] = useState(false);
  const [fromCheckout, setFromCheckout] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "checkout") setFromCheckout(true);
  }, []);

  const checkNow = async () => {
    setCheckingNow(true);
    setError(null);
    try {
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao verificar pagamento");
    } finally {
      setCheckingNow(false);
    }
  };

  const isPaid = useCallback((s: BillingStatus | null) => {
    return Boolean(
      s &&
      (s.business.status === "ACTIVE" ||
        s.subscription?.status === "ACTIVE" ||
        s.last_payment?.status === "RECEIVED"),
    );
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api<BillingStatus>("/api/proxy/billing/status");
      setStatus(s);
      if (s.business.status === "SUSPENDED") {
        setError("Sua conta está suspensa. Fale com o suporte.");
        setMode("pay");
        return;
      }
      if (s.business.status === "CANCELLED") {
        setError("Sua conta foi cancelada. Fale com o suporte.");
        setMode("pay");
        return;
      }
      if (isPaid(s)) {
        setMode("paid");
        if (pollRef.current) clearInterval(pollRef.current);
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 2500);
        return;
      }
      setMode("pay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar status");
      setMode("pay");
    }
  }, [isPaid, router]);

  useEffect(() => {
    void loadStatus();
    pollRef.current = setInterval(() => {
      void api<BillingStatus>("/api/proxy/billing/status")
        .then((s) => {
          if (isPaid(s)) {
            setStatus(s);
            setMode("paid");
            if (pollRef.current) clearInterval(pollRef.current);
            setTimeout(() => {
              router.push("/dashboard");
              router.refresh();
            }, 2500);
          } else {
            setStatus(s);
          }
        })
        .catch(() => {});
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isPaid, loadStatus, router]);

  /** Cria a Checkout Session Stripe e redireciona para o pagamento hospedado. */
  const startCheckout = async () => {
    setStartingCheckout(true);
    setError(null);
    try {
      const result = await api<StripeCheckout>("/api/proxy/billing/checkout", {
        method: "POST",
        body: {},
      });
      window.location.href = result.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar o pagamento");
      setStartingCheckout(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center font-display text-2xl font-bold text-zinc-900">
          Assinatura pendente
        </h1>
        <p className="mb-6 text-center text-sm text-zinc-500">
          {status
            ? `Sua empresa ${status.business.name} aguarda o pagamento para ser ativada.`
            : "Verificando sua assinatura..."}
        </p>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        {mode === "loading" && (
          <Card className="p-6 text-center">
            <div className="animate-pulse text-sm text-zinc-500">
              Carregando...
            </div>
          </Card>
        )}

        {mode === "paid" && (
          <Card className="p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-2xl text-emerald-600">
              ✓
            </div>
            <p className="font-semibold text-zinc-900">Pagamento confirmado!</p>
            <p className="mt-1 text-sm text-zinc-500">
              Redirecionando para o painel...
            </p>
          </Card>
        )}

        {mode === "pay" && status && (
          <Card className="p-6">
            <div className="mb-4">
              <div className="text-sm text-zinc-500">
                Plano:{" "}
                <span className="font-medium text-zinc-900">
                  {status.subscription?.plan_name ?? "—"}
                </span>
              </div>
              <div className="text-sm text-zinc-500">
                Valor:{" "}
                <span className="font-medium text-zinc-900">
                  R${" "}
                  {(status.subscription?.plan_price ?? 0)
                    .toFixed(2)
                    .replace(".", ",")}
                </span>
              </div>
            </div>

            {(status.subscription?.plan_price ?? 0) === 0 ? (
              <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
                Seu plano é gratuito — nenhuma cobrança será feita.
                <Button
                  className="mt-3 w-full"
                  onClick={async () => {
                    try {
                      await api("/api/proxy/billing/activate-free", {
                        method: "POST",
                        body: {},
                      });
                    } catch {
                      /* noop */
                    }
                    await loadStatus();
                  }}
                >
                  Ativar acesso
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-white px-4 py-3 text-sm text-zinc-700">
                  Você será direcionado para o pagamento seguro (PIX recorrente
                  ou cartão). Após pagar, você volta para cá e o acesso é
                  liberado automaticamente.
                </div>
                <Button
                  onClick={() => void startCheckout()}
                  className="w-full"
                  loading={startingCheckout}
                >
                  Continuar para pagamento
                </Button>
                {fromCheckout ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                    {checkingNow
                      ? "Confirmando seu pagamento..."
                      : "Você voltou do pagamento. Estamos aguardando a confirmação do banco — pode levar alguns segundos."}
                  </div>
                ) : null}
                <Button variant="outline" className="w-full" onClick={() => void checkNow()} loading={checkingNow}>
                  Já paguei — verificar pagamento
                </Button>
                <p className="text-center text-[11px] text-zinc-500">
                  O pagamento é processado com segurança. Nunca armazenamos os
                  dados do seu cartão.
                </p>
              </div>
            )}
          </Card>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          <button
            onClick={() => {
              void fetch("/api/auth/session/clear", { method: "POST" }).then(
                () => {
                  router.push("/login");
                  router.refresh();
                },
              );
            }}
            className="text-zinc-500 hover:text-zinc-700"
          >
            Sair
          </button>
        </p>
      </div>
    </div>
  );
}
