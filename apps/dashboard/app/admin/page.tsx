"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { adminApi, AdminDashboard } from "@/lib/admin";
import { Card } from "@/components/ui/card";

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const TOOLTIP_STYLE = {
  backgroundColor: "#0a1e41",
  border: "1px solid rgba(122,156,255,0.25)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#fff",
} as const;

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
    { label: "MRR", value: brl(data.mrr_value), sub: `${data.mrr} assinaturas ativas` },
    { label: "ARR", value: brl(data.arr) },
    { label: "Receita do mês", value: brl(data.month_revenue) },
    { label: "Receita total", value: brl(data.total_revenue) },
    { label: "Empresas", value: String(data.businesses.total), sub: `${data.businesses.active} ativas` },
    { label: "Ativos", value: String(data.active_clients) },
    { label: "Trial", value: String(data.trial) },
    { label: "Canceladas", value: String(data.cancelled), sub: `Churn ${(data.churn * 100).toFixed(1)}%` },
    { label: "Assinaturas vencidas", value: String(data.overdue_subscriptions) },
    { label: "Pagamentos pendentes", value: String(data.pending_payments) },
  ];

  const tokenTotal = Math.max(1, data.ai_usage.tokens);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-strong text-xl">Visão geral</h1>
        <p className="text-sm text-zinc-500">Métricas da plataforma SAVYRON</p>
      </div>

      {/* Cards principais */}
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

      {/* Gráficos de tendência */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-zinc-700">
            Evolução de faturamento (últimos 30 dias)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.revenue_trend} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#71717a" }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "receita"]} />
              <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-sm font-semibold text-zinc-700">
            Crescimento de empresas (últimos 6 meses)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.business_growth} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(16,185,129,0.08)" }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "empresas"]} />
              <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                {data.business_growth.map((b, i) => (
                  <Cell key={b.month} fill={i === data.business_growth.length - 1 ? "#10b981" : "#8b5cf6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Monitoramento da IA */}
      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-zinc-900">
          Uso da IA
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "Tokens consumidos", value: tokenTotal.toLocaleString("pt-BR") },
            { label: "Input tokens", value: data.ai_usage.input_tokens.toLocaleString("pt-BR") },
            { label: "Output tokens", value: data.ai_usage.output_tokens.toLocaleString("pt-BR") },
            { label: "Gerações de IA", value: String(data.ai_usage.generations) },
            { label: "Custo estimado (mês)", value: brl(data.ai_usage.estimated_cost_brl) },
            { label: "Contatos", value: String(data.ai_usage.contacts) },
          ].map((m) => (
            <Card key={m.label} className="p-4">
              <div className="text-xs text-zinc-500">{m.label}</div>
              <div className="mt-1 font-display text-lg font-bold text-zinc-900">{m.value}</div>
            </Card>
          ))}
        </div>
        {/* Proporção input/output */}
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(data.ai_usage.input_tokens / tokenTotal) * 100}%`,
              background: "linear-gradient(90deg,#10b981,#8b5cf6)",
            }}
          />
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Distribuição input/output tokens (verde = input, roxo = output)
        </p>
      </div>

      {/* Monitoramento de mensagens */}
      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-zinc-900">
          Mensagens e interações
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Mensagens totais", value: String(data.messages.total) },
            { label: "Recebidas", value: String(data.messages.inbound) },
            { label: "Enviadas", value: String(data.messages.outbound) },
            { label: "Média por cliente", value: String(data.messages.avg_per_client) },
          ].map((m) => (
            <Card key={m.label} className="p-4">
              <div className="text-xs text-zinc-500">{m.label}</div>
              <div className="mt-1 font-display text-lg font-bold text-zinc-900">{m.value}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
