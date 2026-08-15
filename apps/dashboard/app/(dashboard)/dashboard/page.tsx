'use client';

import {
  Inbox,
  Users,
  MessageCircle,
  Mail,
  MessageSquareReply,
  ThumbsUp,
  ThumbsDown,
  UserX,
  AlertTriangle,
  Megaphone,
} from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { MetricCard } from '@/components/metric-card';
import { Card, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { useApi } from '@/hooks/use-api';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BrasiliaClock } from '@/components/brasilia-clock';

interface Metrics {
  leads_available: number;
  leads_imported: number;
  messages_sent_today: number;
  emails_sent_today: number;
  whatsapp_sent_today: number;
  responses_received: number;
  interested: number;
  not_interested: number;
  opt_outs: number;
  errors: number;
  active_campaigns: number;
  today_activity: { whatsapp: { used: number; limit: number }; email: { used: number; limit: number } };
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  is_test: boolean;
  stats: {
    total: number;
    processed: number;
    pending: number;
    sent: number;
    responded: number;
    interested: number;
    notInterested: number;
    optOut: number;
    errors: number;
    progressPercent: number;
  };
}

interface WhatsAppStatus {
  connected: boolean;
  state: string;
  qrAvailable: boolean;
  loggedIn: boolean;
}

export default function DashboardPage() {
  const metrics = useApi<Metrics>(['metrics'], 'dashboard/metrics', { refetchInterval: 15000 });
  const campaigns = useApi<Campaign[]>(['campaigns'], 'campaigns', { refetchInterval: 15000 });
  const wa = useApi<WhatsAppStatus>(['whatsapp-status'], 'whatsapp/status', { refetchInterval: 30000 });

  const loading = metrics.isLoading;

  return (
    <DashboardShell title="Dashboard">
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <BrasiliaClock />
          </div>
          {/* WhatsApp status banner */}
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              wa.data?.connected ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <MessageCircle className={wa.data?.connected ? 'h-5 w-5 text-emerald-600' : 'h-5 w-5 text-amber-600'} />
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  WhatsApp {wa.data?.connected ? 'conectado' : wa.data?.qrAvailable ? 'aguardando QR code' : 'desconectado'}
                </div>
                <div className="text-[11px] text-zinc-500">Estado: {wa.data?.state ?? 'verificando…'}</div>
              </div>
            </div>
            <Link href="/settings" className="shrink-0">
              <Button variant="outline" size="sm">
                Gerenciar
              </Button>
            </Link>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon={Inbox} label="Leads na fila" value={metrics.data?.leads_available ?? 0} tone="amber" hint="aguardando envio" />
            <MetricCard icon={Users} label="Leads importados" value={metrics.data?.leads_imported ?? 0} />
            <MetricCard icon={MessageCircle} label="WhatsApp hoje" value={metrics.data?.whatsapp_sent_today ?? 0} tone="whatsapp" hint={`limite ${metrics.data?.today_activity.whatsapp.limit ?? 30}`} />
            <MetricCard icon={Mail} label="E-mails hoje" value={metrics.data?.emails_sent_today ?? 0} hint={`limite ${metrics.data?.today_activity.email.limit ?? 100}`} />
            <MetricCard icon={MessageSquareReply} label="Respostas hoje" value={metrics.data?.responses_received ?? 0} tone="blue" />
            <MetricCard icon={ThumbsUp} label="Interessados" value={metrics.data?.interested ?? 0} />
            <MetricCard icon={ThumbsDown} label="Não interessados" value={metrics.data?.not_interested ?? 0} />
            <MetricCard icon={UserX} label="Opt-outs" value={metrics.data?.opt_outs ?? 0} tone="zinc" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard icon={Megaphone} label="Campanhas ativas" value={metrics.data?.active_campaigns ?? 0} tone="blue" />
            <MetricCard icon={AlertTriangle} label="Erros" value={metrics.data?.errors ?? 0} tone="red" />
            <MetricCard icon={MessageCircle} label="Mensagens enviadas hoje" value={metrics.data?.messages_sent_today ?? 0} />
          </div>

          {/* Limites diários */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Limite diário de WhatsApp" subtitle="Contatos por dia" />
              <Progress value={metrics.data?.today_activity.whatsapp.used ?? 0} max={metrics.data?.today_activity.whatsapp.limit ?? 1} tone="whatsapp" />
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>{metrics.data?.today_activity.whatsapp.used ?? 0} enviados</span>
                <span>limite {metrics.data?.today_activity.whatsapp.limit ?? 0}</span>
              </div>
            </Card>
            <Card>
              <CardHeader title="Limite diário de E-mail" subtitle="E-mails por dia" />
              <Progress value={metrics.data?.today_activity.email.used ?? 0} max={metrics.data?.today_activity.email.limit ?? 1} />
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>{metrics.data?.today_activity.email.used ?? 0} enviados</span>
                <span>limite {metrics.data?.today_activity.email.limit ?? 0}</span>
              </div>
            </Card>
          </div>

          {/* Campanhas ativas */}
          <Card>
            <CardHeader
              title="Campanhas"
              subtitle="Resumo das campanhas cadastradas"
              action={
                <Link href="/campaigns">
                  <Button variant="outline" size="sm">
                    Ver todas
                  </Button>
                </Link>
              }
            />
            {campaigns.data && campaigns.data.length > 0 ? (
              <div className="space-y-3">
                {(campaigns.data ?? []).slice(0, 5).map((c) => (
                  <Link key={c.id} href={`/campaigns/${c.id}`} className="block rounded-xl border border-zinc-200 p-4 transition-colors hover:bg-zinc-100">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900">{c.name}</span>
                        {c.is_test ? <StatusBadge status="TEST" /> : null}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    <Progress value={c.stats.processed} max={Math.max(1, c.stats.total)} />
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[11px] text-zinc-500">
                      <div>
                        <div className="font-semibold text-zinc-700">{c.stats.total}</div>
                        total
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-700">{c.stats.pending}</div>
                        pendentes
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-700">{c.stats.responded}</div>
                        respostas
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-700">{c.stats.interested}</div>
                        interessados
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="text-sm text-zinc-500">Nenhuma campanha criada ainda.</div>
                <Link href="/campaigns">
                  <Button className="mt-4">Criar campanha</Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
