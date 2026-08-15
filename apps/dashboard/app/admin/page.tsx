"use client";

import { useEffect, useState } from "react";
import { adminApi, AdminDashboard } from "@/lib/admin";
import { Card } from "@/components/ui/card";

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi<AdminDashboard>("/admin/dashboard")
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Falha ao carregar"),
      );
  }, []);

  if (error)
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
        {error}
      </div>
    );
  if (!data) return <div className="text-sm text-zinc-500">Carregando...</div>;

  const metrics = [
    {
      label: "MRR",
      value: brl(data.mrr_value),
      sub: `${data.mrr} assinaturas ativas`,
    },
    { label: "ARR", value: brl(data.arr) },
    { label: "Receita do mês", value: brl(data.month_revenue) },
    { label: "Receita total", value: brl(data.total_revenue) },
    {
      label: "Empresas",
      value: String(data.businesses.total),
      sub: `${data.businesses.active} ativas`,
    },
    { label: "Ativos", value: String(data.active_clients) },
    { label: "Trial", value: String(data.trial) },
    {
      label: "Canceladas",
      value: String(data.cancelled),
      sub: `Churn ${(data.churn * 100).toFixed(1)}%`,
    },
    {
      label: "Assinaturas vencidas",
      value: String(data.overdue_subscriptions),
    },
    { label: "Pagamentos pendentes", value: String(data.pending_payments) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-strong text-xl">
          Visão geral
        </h1>
        <p className="text-sm text-zinc-500">
          Métricas da plataforma SAVYRON
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="text-xs text-zinc-500">{m.label}</div>
            <div className="mt-1 font-display text-lg font-bold text-zinc-900">
              {m.value}
            </div>
            {m.sub ? (
              <div className="mt-0.5 text-[11px] text-zinc-500">{m.sub}</div>
            ) : null}
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-zinc-900">
          Uso da IA
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Contatos", value: data.ai_usage.contacts },
            { label: "Conversas", value: data.ai_usage.conversations },
            { label: "Mensagens", value: data.ai_usage.messages },
            { label: "Gerações de IA", value: data.ai_usage.generations },
          ].map((m) => (
            <Card key={m.label} className="p-4">
              <div className="text-xs text-zinc-500">{m.label}</div>
              <div className="mt-1 font-display text-lg font-bold text-zinc-900">
                {m.value}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
