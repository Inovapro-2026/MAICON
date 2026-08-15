'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/button';
import { useApi } from '@/hooks/use-api';
import { BrasiliaClock } from '@/components/brasilia-clock';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface Report {
  period: { from: string; to: string };
  response_rate: number;
  interest_rate: number;
  conversion_rate: number;
  opt_out_rate: number;
  total_sent: number;
  total_responded: number;
  total_interested: number;
  total_opt_out: number;
  series: { date: string; sent: number; responded: number; interested: number }[];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 13);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());

  const report = useApi<Report>(
    ['report', from, to],
    `reports?from=${from}&to=${to}`
  );

  const r = report.data;

  return (
    <DashboardShell title="Relatórios">
      <div className="space-y-6">
        <div className="flex justify-end">
          <BrasiliaClock />
        </div>
        <Card>
          <CardHeader title="Período" subtitle="Filtre as métricas por intervalo de datas" />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">De</label>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input w-auto" />
            </div>
            <div>
              <label className="label">Até</label>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input w-auto" />
            </div>
            <Button size="sm" onClick={() => report.refetch()}>
              Atualizar
            </Button>
          </div>
        </Card>

        {report.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : r ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <RateCard label="Taxa de resposta" value={r.response_rate} />
              <RateCard label="Taxa de interesse" value={r.interest_rate} />
              <RateCard label="Taxa de conversão" value={r.conversion_rate} tone="emerald" />
              <RateCard label="Taxa de opt-out" value={r.opt_out_rate} tone="red" />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <CountCard label="Enviadas" value={r.total_sent} />
              <CountCard label="Respostas" value={r.total_responded} tone="blue" />
              <CountCard label="Interessados" value={r.total_interested} tone="emerald" />
              <CountCard label="Opt-outs" value={r.total_opt_out} />
            </div>

            <Card>
              <CardHeader title="Envios por dia" subtitle="Volume diário no período" />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.series}>
                    <CartesianGrid stroke="#E5E5E5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} stroke="#E5E5E5" />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} stroke="#E5E5E5" />
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} labelStyle={{ color: '#111827' }} itemStyle={{ color: '#111827' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="sent" name="Enviadas" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="responded" name="Respostas" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Interessados acumulados" subtitle="Evolução no período" />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={r.series}>
                    <CartesianGrid stroke="#E5E5E5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} stroke="#E5E5E5" />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} stroke="#E5E5E5" />
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }} labelStyle={{ color: '#111827' }} itemStyle={{ color: '#111827' }} />
                    <Line type="monotone" dataKey="interested" name="Interessados" stroke="#34D399" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="flex items-center gap-3 text-sm text-zinc-500">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              <span>
                Nota: as taxas usam somente dados reais registrados no período. Conteúdo aguardando campanhas com volume para ficar mais preciso.
              </span>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}

function RateCard({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'red' }) {
  const color = tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : 'text-zinc-900';
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className={`font-display text-3xl font-bold ${color}`}>{value}%</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function CountCard({ label, value, tone }: { label: string; value: number; tone?: 'blue' | 'emerald' }) {
  const color = tone === 'blue' ? 'text-blue-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-zinc-900';
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className={`font-display text-3xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}
