'use client';

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';

interface EmailLog {
  id: string;
  to: string;
  subject: string;
  status: 'SENT' | 'FAILED' | 'BOUNCED';
  provider: string;
  provider_message_id: string | null;
  related_campaign_id: string | null;
  error: string | null;
  sent_at: string;
}

interface EmailsResponse {
  total: number;
  page: number;
  pageSize: number;
  emails: EmailLog[];
}

const STATUS_FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'SENT', label: 'Enviados' },
  { key: 'FAILED', label: 'Falhas' },
  { key: 'BOUNCED', label: 'Devolvidos' },
];

const STATUS_BADGE: Record<EmailLog['status'], { tone: 'emerald' | 'red' | 'amber'; label: string }> = {
  SENT: { tone: 'emerald', label: 'Enviado' },
  FAILED: { tone: 'red', label: 'Falhou' },
  BOUNCED: { tone: 'amber', label: 'Devolvido' },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 13);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function EmailsPage() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());

  const query = `emails?pageSize=100&status=${status}&from=${from}&to=${to}`;
  const emails = useApi<EmailsResponse>(['emails', status, from, to], query, { refetchInterval: 20000 });

  const list = emails.data?.emails ?? [];

  return (
    <DashboardShell title="E-mails enviados">
      <div className="space-y-4">
        {/* Filtros */}
        <Card className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
              {STATUS_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">De</label>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="input w-auto" />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="input w-auto" />
          </div>
          <Button size="sm" onClick={() => emails.refetch()}>
            Atualizar
          </Button>
        </Card>

        {emails.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : list.length > 0 ? (
          <>
            <p className="text-xs text-zinc-500">{emails.data?.total ?? list.length} e-mail{list.length === 1 ? '' : 's'}</p>
            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-white text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Destinatário</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Assunto</th>
                    <th className="px-4 py-3">Data/hora</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id} className="border-t border-zinc-200 hover:bg-zinc-100">
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-zinc-900">{e.to}</td>
                      <td className="hidden max-w-[320px] truncate px-4 py-2.5 text-zinc-700 sm:table-cell" title={e.error ?? ''}>
                        {e.subject}
                        {e.error ? <span className="ml-1 text-[11px] text-red-600">({e.error})</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{formatDateTime(e.sent_at)}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_BADGE[e.status]?.tone ?? 'zinc'}>{STATUS_BADGE[e.status]?.label ?? e.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Card className="py-16 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
            <div className="text-sm text-zinc-500">Nenhum e-mail enviado no período.</div>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
