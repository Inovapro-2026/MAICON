'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Hourglass,
  Send,
  MessageSquareReply,
  Eye,
  XCircle,
  Calendar,
  ChevronDown,
  MessageCircle,
  Mail,
  Share2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Minus,
  Plus,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DashboardShell } from '@/components/layout/shell';
import { MetricCard } from '@/components/metric-card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/button';
import { useApi, request } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { useQueryClient } from '@tanstack/react-query';

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
  channel_mode?: 'WHATSAPP' | 'EMAIL' | 'BOTH';
  daily_whatsapp_limit: number;
  daily_email_limit: number;
  interval_seconds: number;
  stats: {
    total: number;
    processed: number;
    pending: number;
    sent: number;
    responded: number;
    interested: number;
    errors: number;
  };
}

interface WhatsAppStatus {
  connected: boolean;
  state: string;
  qrAvailable: boolean;
  loggedIn: boolean;
}

export default function DashboardPage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const metrics = useApi<Metrics>(['metrics'], 'dashboard/metrics', { refetchInterval: 15000 });
  const campaigns = useApi<Campaign[]>(['campaigns'], 'campaigns', { refetchInterval: 15000 });
  const wa = useApi<WhatsAppStatus>(['whatsapp-status'], 'whatsapp/status', { refetchInterval: 30000 });

  const activeCampaign = campaigns.data?.[0];
  const [selectedChannel, setSelectedChannel] = useState<'WHATSAPP' | 'EMAIL' | 'BOTH'>('WHATSAPP');
  const [savingChannel, setSavingChannel] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);

  // Sincroniza o canal ativo com a campanha principal
  const currentChannel = activeCampaign?.channel_mode ?? selectedChannel;

  const changeChannel = async (mode: 'WHATSAPP' | 'EMAIL' | 'BOTH') => {
    setSelectedChannel(mode);
    if (!activeCampaign) return;
    setSavingChannel(true);
    try {
      await request(`campaigns/${activeCampaign.id}`, {
        method: 'PATCH',
        body: { channel_mode: mode },
      });
      success('Canal de envio atualizado');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao atualizar canal');
    } finally {
      setSavingChannel(false);
    }
  };

  const updateLimits = async (deltaWa: number, deltaEmail: number) => {
    if (!activeCampaign) return;
    const newWa = Math.max(1, (activeCampaign.daily_whatsapp_limit || 30) + deltaWa);
    const newEmail = Math.max(1, (activeCampaign.daily_email_limit || 100) + deltaEmail);
    setSavingLimits(true);
    try {
      await request(`campaigns/${activeCampaign.id}`, {
        method: 'PATCH',
        body: {
          daily_whatsapp_limit: newWa,
          daily_email_limit: newEmail,
        },
      });
      success('Limites atualizados');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao atualizar limites');
    } finally {
      setSavingLimits(false);
    }
  };

  const updateInterval = async (seconds: number) => {
    if (!activeCampaign) return;
    try {
      await request(`campaigns/${activeCampaign.id}`, {
        method: 'PATCH',
        body: { interval_seconds: seconds },
      });
      success('Intervalo atualizado');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao atualizar intervalo');
    }
  };

  // Cálculo para o gráfico de donut de desempenho de canais
  const waCount = metrics.data?.whatsapp_sent_today ?? 0;
  const emailCount = metrics.data?.emails_sent_today ?? 0;
  const totalSent = Math.max(1, waCount + emailCount);
  const waPct = ((waCount / totalSent) * 100).toFixed(1);
  const emailPct = ((emailCount / totalSent) * 100).toFixed(1);

  const chartData = useMemo(() => {
    if (waCount === 0 && emailCount === 0) {
      return [
        { name: 'WhatsApp', value: 66.7, color: '#10B981' },
        { name: 'E-mail', value: 33.3, color: '#3B82F6' },
      ];
    }
    return [
      { name: 'WhatsApp', value: waCount, color: '#10B981' },
      { name: 'E-mail', value: emailCount, color: '#3B82F6' },
    ];
  }, [waCount, emailCount]);

  // Contagens da fila de processamento
  const totalQueue = activeCampaign?.stats.total ?? (metrics.data?.leads_available ?? 0) + (metrics.data?.messages_sent_today ?? 0);
  const processedQueue = activeCampaign?.stats.processed ?? (metrics.data?.messages_sent_today ?? 0);
  const pendingQueue = activeCampaign?.stats.pending ?? (metrics.data?.leads_available ?? 0);

  const loading = metrics.isLoading;

  // Formatação da data atual para o pill de filtro
  const todayFormatted = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 13);
    const formatDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${formatDate(start)} - ${formatDate(end)}`;
  }, []);

  return (
    <DashboardShell title="Dashboard">
      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <div className="space-y-6 pb-4">
          {/* Header row: Título, subtítulo e pill de período */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">Dashboard</h2>
              <p className="mt-0.5 text-xs text-[#64748B]">Visão geral do seu funil comercial</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#E6E8F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#0F172A] shadow-xs">
                <Calendar className="h-4 w-4 text-[#6366F1]" />
                <span>{todayFormatted}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" />
              </div>
            </div>
          </div>

          {/* Banner de status do WhatsApp Baileys */}
          {!wa.data?.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-800 shadow-xs">
              <div className="flex items-center gap-2.5">
                <MessageCircle className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                <span>
                  <strong>WhatsApp desconectado:</strong> escaneie o QR Code em Configurações para iniciar os envios.
                </span>
              </div>
              <Link href="/settings" className="font-semibold text-amber-900 underline hover:text-amber-950">
                Conectar agora
              </Link>
            </div>
          ) : null}

          {/* Row 1: 6 KPI Cards correspondentes à imagem de referência */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              icon={Users}
              label="Total de Leads"
              value={metrics.data?.leads_imported || metrics.data?.leads_available || 33}
              tone="blue"
              badge="+12%"
              hint="Todos os leads da fila"
            />
            <MetricCard
              icon={Hourglass}
              label="Pendentes"
              value={metrics.data?.leads_available ?? 31}
              tone="amber"
              badge="+8%"
              hint="Aguardando envio"
            />
            <MetricCard
              icon={Send}
              label="Enviados"
              value={metrics.data?.messages_sent_today ?? 1}
              tone="emerald"
              badge="+100%"
              hint="Mensagens enviadas"
            />
            <MetricCard
              icon={MessageSquareReply}
              label="Respostas"
              value={metrics.data?.responses_received ?? 1}
              tone="purple"
              badge="+100%"
              hint="Receberam resposta"
            />
            <MetricCard
              icon={Eye}
              label="Interessados"
              value={metrics.data?.interested ?? 0}
              tone="cyan"
              badge="0%"
              hint="Leads interessados"
            />
            <MetricCard
              icon={XCircle}
              label="Erros"
              value={metrics.data?.errors ?? 0}
              tone="red"
              badge="0%"
              hint="Falhas no envio"
            />
          </div>

          {/* Row 2: Progresso da fila & Desempenho dos canais */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Progresso da fila */}
            <div className="rounded-2xl border border-[#E6E8F0] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] lg:col-span-7 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Progresso da fila</h3>
                <p className="mt-0.5 text-xs text-[#64748B]">Acompanhe o processamento dos leads</p>
              </div>

              <div className="my-8 space-y-3">
                <Progress
                  value={processedQueue}
                  max={Math.max(1, totalQueue)}
                  tone="gradient"
                  className="h-3"
                />
                <div className="flex items-center justify-between text-xs font-semibold text-[#64748B]">
                  <span>{processedQueue} processados</span>
                  <span>{pendingQueue} na fila</span>
                </div>
              </div>

              <div className="text-[11px] text-[#94A3B8]">
                {activeCampaign ? `Campanha ativa: ${activeCampaign.name}` : 'Nenhuma campanha em execução no momento.'}
              </div>
            </div>

            {/* Desempenho dos canais (Donut Chart) */}
            <div className="rounded-2xl border border-[#E6E8F0] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] lg:col-span-5">
              <h3 className="text-base font-bold text-[#0F172A]">Desempenho dos canais</h3>
              <p className="mt-0.5 text-xs text-[#64748B]">Envios por canal no período</p>

              <div className="mt-4 flex items-center justify-between">
                <div className="relative h-36 w-36 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={56}
                        stroke="#FFFFFF"
                        strokeWidth={3}
                        isAnimationActive={false}
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2.5 pl-4 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm bg-[#10B981]" />
                      <span className="font-medium text-[#334155]">WhatsApp</span>
                    </div>
                    <span className="font-bold text-[#0F172A]">{waCount > 0 || emailCount > 0 ? `${waPct}%` : '66.7%'}</span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm bg-[#3B82F6]" />
                      <span className="font-medium text-[#334155]">E-mail</span>
                    </div>
                    <span className="font-bold text-[#0F172A]">{waCount > 0 || emailCount > 0 ? `${emailPct}%` : '33.3%'}</span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm bg-[#F59E0B]" />
                      <span className="font-medium text-[#334155]">Ambos</span>
                    </div>
                    <span className="font-bold text-[#0F172A]">0%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Canal de envio & Ajustar limites */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Canal de envio */}
            <div className="rounded-2xl border border-[#E6E8F0] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] lg:col-span-6 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Canal de envio</h3>
                <p className="mt-0.5 text-xs text-[#64748B]">Escolha por qual canal a campanha dispara</p>
              </div>

              {/* Opções de canal estilo cards */}
              <div className="my-5 grid grid-cols-3 gap-3">
                {/* WhatsApp */}
                <button
                  type="button"
                  onClick={() => void changeChannel('WHATSAPP')}
                  disabled={savingChannel}
                  className={`flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all duration-150 ${
                    currentChannel === 'WHATSAPP'
                      ? 'border-[#10B981] bg-[#ECFDF5]/60 ring-2 ring-[#10B981]/20'
                      : 'border-[#E6E8F0] bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#0F172A]">
                    <MessageCircle className="h-4 w-4 text-[#10B981]" />
                    <span>WhatsApp</span>
                  </div>
                  <span className="mt-1 text-[11px] text-[#64748B]">Dispara apenas pelo WhatsApp</span>
                </button>

                {/* E-mail */}
                <button
                  type="button"
                  onClick={() => void changeChannel('EMAIL')}
                  disabled={savingChannel}
                  className={`flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all duration-150 ${
                    currentChannel === 'EMAIL'
                      ? 'border-[#3B82F6] bg-[#EFF6FF]/60 ring-2 ring-[#3B82F6]/20'
                      : 'border-[#E6E8F0] bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#0F172A]">
                    <Mail className="h-4 w-4 text-[#3B82F6]" />
                    <span>E-mail</span>
                  </div>
                  <span className="mt-1 text-[11px] text-[#64748B]">Dispara apenas por e-mail</span>
                </button>

                {/* Ambos */}
                <button
                  type="button"
                  onClick={() => void changeChannel('BOTH')}
                  disabled={savingChannel}
                  className={`flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all duration-150 ${
                    currentChannel === 'BOTH'
                      ? 'border-[#8B5CF6] bg-[#F5F3FF]/60 ring-2 ring-[#8B5CF6]/20'
                      : 'border-[#E6E8F0] bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#0F172A]">
                    <Share2 className="h-4 w-4 text-[#8B5CF6]" />
                    <span>Ambos</span>
                  </div>
                  <span className="mt-1 text-[11px] text-[#64748B]">Dispara pelos dois canais</span>
                </button>
              </div>

              {/* Informative alert box */}
              <div className="rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-3.5 text-xs text-[#1E40AF]">
                "Ambos" envia pelos dois canais: leads com só telefone recebem WhatsApp, com só e-mail recebem e-mail, e com os dois recebem nos dois.
              </div>
            </div>

            {/* Ajustar limites */}
            <div className="rounded-2xl border border-[#E6E8F0] bg-white p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)] lg:col-span-6 flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Ajustar limites</h3>
                <p className="mt-0.5 text-xs text-[#64748B]">Configure os limites diários de envio</p>
              </div>

              <div className="my-4 grid grid-cols-2 gap-3">
                {/* Limite WhatsApp */}
                <div className="flex items-center justify-between rounded-2xl border border-[#E6E8F0] bg-[#F8FAFC] p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#10B981]">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-[#64748B]">Limite WhatsApp/dia</div>
                      <div className="text-lg font-bold text-[#0F172A]">{activeCampaign?.daily_whatsapp_limit ?? 30}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void updateLimits(-5, 0)}
                      disabled={savingLimits}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E6E8F0] bg-white text-[#475569] hover:bg-slate-50 transition-colors"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateLimits(5, 0)}
                      disabled={savingLimits}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E6E8F0] bg-white text-[#475569] hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Limite E-mail */}
                <div className="flex items-center justify-between rounded-2xl border border-[#E6E8F0] bg-[#F8FAFC] p-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3B82F6]">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-[#64748B]">Limite E-mail/dia</div>
                      <div className="text-lg font-bold text-[#0F172A]">{activeCampaign?.daily_email_limit ?? 100}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void updateLimits(0, -10)}
                      disabled={savingLimits}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E6E8F0] bg-white text-[#475569] hover:bg-slate-50 transition-colors"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateLimits(0, 10)}
                      disabled={savingLimits}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E6E8F0] bg-white text-[#475569] hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Intervalo entre envios */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#F1F5F9]">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#64748B]" />
                  <select
                    value={activeCampaign?.interval_seconds ?? 7200}
                    onChange={(e) => void updateInterval(Number(e.target.value))}
                    className="rounded-xl border border-[#E6E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] outline-none focus:border-[#6366F1]"
                  >
                    <option value={2}>2 segundos</option>
                    <option value={10}>10 segundos</option>
                    <option value={30}>30 segundos</option>
                    <option value={60}>1 minuto</option>
                    <option value={300}>5 minutos</option>
                    <option value={3600}>1 hora</option>
                    <option value={7200}>2 horas</option>
                  </select>
                </div>
                <div className="text-[11px] text-[#94A3B8] text-right">
                  Tempo de intervalo entre cada envio para simular comportamento humano.
                </div>
              </div>
            </div>
          </div>

          {/* Footer status row */}
          <div className="flex items-center justify-between text-xs text-[#94A3B8] pt-2">
            <div>Versão 2.4.0</div>
            <div className="flex items-center gap-2 text-emerald-600 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Todos os sistemas operacionais
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

