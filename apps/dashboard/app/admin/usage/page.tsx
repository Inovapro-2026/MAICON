"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, AdminUsageRow, AdminBusiness } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function defaultMonth(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

export default function AdminUsagePage() {
  const [rows, setRows] = useState<AdminUsageRow[]>([]);
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState("");
  const [range, setRange] = useState(() => defaultMonth());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (businessId) params.set("businessId", businessId);
      const r = await adminApi<{ usage: AdminUsageRow[] }>(
        `/admin/usage?${params.toString()}`,
      );
      setRows(r.usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar uso");
    } finally {
      setLoading(false);
    }
  }, [businessId, range.from, range.to]);

  useEffect(() => {
    void load();
    adminApi<AdminBusiness[]>("/admin/businesses")
      .then(setBusinesses)
      .catch(() => {});
  }, [load]);

  const totals = rows.reduce(
    (acc, r) => ({
      messages_sent: acc.messages_sent + r.messages_sent,
      messages_received: acc.messages_received + r.messages_received,
      conversations: acc.conversations + r.conversations,
      ai_generations: acc.ai_generations + r.ai_generations,
      ai_input_tokens: acc.ai_input_tokens + r.ai_input_tokens,
      ai_output_tokens: acc.ai_output_tokens + r.ai_output_tokens,
      leads: acc.leads + r.leads_created,
      opt_outs: acc.opt_outs + r.opt_outs,
    }),
    {
      messages_sent: 0,
      messages_received: 0,
      conversations: 0,
      ai_generations: 0,
      ai_input_tokens: 0,
      ai_output_tokens: 0,
      leads: 0,
      opt_outs: 0,
    },
  );

  const totalsTokens = totals.ai_input_tokens + totals.ai_output_tokens;

  const metricCard = (label: string, value: number) => (
    <Card className="p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-zinc-900">
        {value.toLocaleString("pt-BR")}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading-strong text-xl">Uso</h1>
        <p className="text-sm text-zinc-500">
          Consumo por empresa agregado de dados reais (mensagens, IA, conversas,
          contatos)
        </p>
      </div>

      <Card className="p-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="label">Empresa</label>
            <select
              className="input"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
            >
              <option value="">Todas</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">De</label>
            <Input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Até</label>
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void load()}>Aplicar</Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {metricCard("Mensagens enviadas", totals.messages_sent)}
        {metricCard("Mensagens recebidas", totals.messages_received)}
        {metricCard("Conversas", totals.conversations)}
        {metricCard("Gerações de IA", totals.ai_generations)}
        {metricCard("Tokens de IA", totalsTokens)}
        {metricCard("Contatos criados", totals.leads)}
        {metricCard("Opt-outs", totals.opt_outs)}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="text-sm text-zinc-500">Carregando...</div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3 text-right">Enviadas</th>
                <th className="px-4 py-3 text-right">Recebidas</th>
                <th className="px-4 py-3 text-right">Conversas</th>
                <th className="px-4 py-3 text-right">IA (gerações)</th>
                <th className="px-4 py-3 text-right">Tokens</th>
                <th className="px-4 py-3 text-right">Contatos</th>
                <th className="px-4 py-3 text-right">Opt-outs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.business_id}
                  className="border-b border-zinc-200 last:border-0"
                >
                  <td className="px-4 py-2.5 text-zinc-700">
                    {r.business_name}
                    <span className="ml-2 text-[11px] text-zinc-500">
                      {r.business_slug}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-700">
                    {r.messages_sent}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">
                    {r.messages_received}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">
                    {r.conversations}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">
                    {r.ai_generations}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">
                    {(r.ai_input_tokens + r.ai_output_tokens).toLocaleString(
                      "pt-BR",
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">
                    {r.leads_created}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">
                    {r.opt_outs}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-4 text-center text-zinc-500"
                  >
                    Nenhum consumo no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
