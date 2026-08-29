"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { request } from "@/hooks/use-api";

interface PixResult {
  paymentId: string;
  amount: number;
  brCode: string;
  brCodeBase64: string;
  expiresAt: string | null;
  checkoutId: string;
}

interface BillingStatus {
  business: {
    id: string;
    name: string;
    status: string;
    suspension_reason?: string | null;
  };
  subscription: {
    id: string;
    status: string;
    plan_name: string | null;
    plan_price: number | null;
    current_period_end: string | null;
  } | null;
  abacatepay_configured: boolean;
}

interface PixCheckoutProps {
  /** Chamado quando o pagamento é confirmado (status ACTIVE / CONFIRMED). */
  onPaid?: () => void;
  /** Título exibido no cartão. */
  title?: string;
}

/**
 * PixCheckout — gera e exibe o PIX da AbacatePay (QR + copia-e-cola) e faz
 * polling do /billing/status até o pagamento ser confirmado. Usado nas telas
 * de pagamento (/payment) e de renovação (/settings/plano).
 */
export function PixCheckout({
  onPaid,
  title = "Pague via PIX",
}: PixCheckoutProps) {
  const [pix, setPix] = useState<PixResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generatePix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await request<PixResult>("billing/abacatepay/pix", {
        method: "POST",
        body: {},
      });
      setPix(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar o PIX");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void generatePix();
  }, [generatePix]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      void request<BillingStatus>("billing/status")
        .then((s) => {
          const paid =
            s.business.status === "ACTIVE" ||
            s.subscription?.status === "ACTIVE";
          if (paid) {
            if (pollRef.current) clearInterval(pollRef.current);
            onPaid?.();
          }
        })
        .catch(() => {});
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [onPaid]);

  const copyCode = async () => {
    if (!pix?.brCode) return;
    try {
      await navigator.clipboard.writeText(pix.brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const formattedAmount = (amount: number) =>
    `R$ ${amount.toFixed(2).replace(".", ",")}`;

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-center font-display text-lg font-bold text-zinc-900">
        {title}
      </h2>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
          <p className="text-sm text-zinc-500">Gerando seu PIX...</p>
        </div>
      ) : error ? (
        <div className="space-y-3 py-2">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void generatePix()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : pix ? (
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pix.brCodeBase64}
              alt="QR Code PIX"
              className="h-52 w-52 rounded-2xl border border-zinc-200 bg-white p-2"
            />
          </div>

          <div className="text-center text-sm text-zinc-500">
            Valor:{" "}
            <span className="font-semibold text-zinc-900">
              {formattedAmount(pix.amount)}
            </span>
            {pix.expiresAt ? (
              <span className="mx-1 text-zinc-400">·</span>
            ) : null}
            {pix.expiresAt ? (
              <span>
                Vence em{" "}
                {new Date(pix.expiresAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Copia e cola
            </div>
            <p className="mb-3 break-all rounded-lg bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-600">
              {pix.brCode}
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void copyCode()}
            >
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copiado!" : "Copiar código PIX"}
            </Button>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            Após pagar, o acesso é liberado automaticamente em alguns segundos.
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setChecking(true);
              request<BillingStatus>("billing/status")
                .then((s) => {
                  const paid =
                    s.business.status === "ACTIVE" ||
                    s.subscription?.status === "ACTIVE";
                  if (paid) onPaid?.();
                  else setError("Pagamento ainda não confirmado.");
                })
                .catch(() => {})
                .finally(() => setChecking(false));
            }}
            loading={checking}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Já paguei — verificar
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
