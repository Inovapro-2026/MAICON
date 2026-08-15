'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Play, Pause, Square, RotateCcw, ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useApi, request } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';
import { NextSendCountdown } from '@/components/countdown';

interface CampaignDetail {
  campaign: {
    id: string;
    name: string;
    status: string;
    daily_whatsapp_limit: number;
    daily_email_limit: number;
    interval_seconds: number;
    is_test: boolean;
    start_hour: number | null;
    next_send_at: string | null;
  };
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
    whatsappSentToday: number;
    emailSentToday: number;
  };
}

interface CampaignLeadItem {
  id: string;
  status: string;
  channel: string | null;
  attempts: number;
  lead: { id: string; name: string | null; phone: string | null; email: string | null; business_name: string | null };
}

function startHourToTimeInput(startHour: number | null): string {
  if (startHour === null || startHour === undefined) return '';
  const h = Math.floor(startHour / 60);
  const m = startHour % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const detail = useApi<CampaignDetail>(['campaign', id], `campaigns/${id}`, { refetchInterval: 10000 });
  const leads = useApi<{ total: number; items: CampaignLeadItem[] }>(['campaign-leads', id], `campaigns/${id}/leads?pageSize=50`, { refetchInterval: 10000 });

  const [waLimit, setWaLimit] = useState('');
  const [emailLimit, setEmailLimit] = useState('');
  const [interval, setInterval] = useState('');
  const [startHour, setStartHour] = useState('');
  const [saving, setSaving] = useState(false);

  const campaign = detail.data?.campaign;
  const stats = detail.data?.stats;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    queryClient.invalidateQueries({ queryKey: ['campaign-leads', id] });
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  };

  const action = async (act: string) => {
    try {
      await request(`campaigns/${id}/${act}`, { method: 'POST', body: {} });
      success('Operação realizada');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha na operação');
    }
  };

  const saveLimits = async () => {
    setSaving(true);
    try {
      await request(`campaigns/${id}`, {
        method: 'PATCH',
        body: {
          ...(waLimit ? { daily_whatsapp_limit: Number(waLimit) } : {}),
          ...(emailLimit ? { daily_email_limit: Number(emailLimit) } : {}),
          ...(interval ? { interval_seconds: Number(interval) } : {}),
          ...(startHour ? { start_hour: startHour } : {}),
        },
      });
      success('Limites atualizados');
      setWaLimit('');
      setEmailLimit('');
      setInterval('');
      setStartHour('');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  const deleteCampaign = async () => {
    setDeleting(true);
    try {
      await request(`campaigns/${id}`, { method: 'DELETE', body: {} });
      success('Campanha excluída');
      router.push('/campaigns');
      router.refresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao excluir');
      setDeleting(false);
    }
  };

  return (
    <DashboardShell title={campaign?.name ?? 'Campanha'}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/campaigns" className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="flex flex-wrap gap-2">
            {campaign?.status === 'PAUSED' ? (
              <Button size="sm" onClick={() => void action('start')}>
                <Play className="h-4 w-4" /> Iniciar
              </Button>
            ) : null}
            {campaign?.status === 'ACTIVE' ? (
              <>
                <Button size="sm" variant="danger" onClick={() => void action('pause')}>
                  <Pause className="h-4 w-4" /> Pausar agora
                </Button>
                <Button size="sm" variant="danger" onClick={() => void action('finish')}>
                  <Square className="h-4 w-4" /> Encerrar
                </Button>
              </>
            ) : null}
            {campaign?.status === 'FINISHED' ? (
              <Button size="sm" variant="outline" onClick={() => void action('resume')}>
                <RotateCcw className="h-4 w-4" /> Reabrir
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-500/10 hover:text-red-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </div>
        </div>

        {campaign ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={campaign.status === 'ACTIVE' ? 'emerald' : campaign.status === 'PAUSED' ? 'amber' : 'zinc'}>
              {campaign.status === 'ACTIVE' ? 'Ativa' : campaign.status === 'PAUSED' ? 'Pausada' : 'Encerrada'}
            </Badge>
            {campaign.is_test ? <Badge tone="blue">teste</Badge> : null}
            <span className="text-xs text-zinc-500">
              Limite WA {campaign.daily_whatsapp_limit}/dia · E-mail {campaign.daily_email_limit}/dia · intervalo {campaign.interval_seconds}s
              {campaign.start_hour != null ? ` · inicia ${startHourToTimeInput(campaign.start_hour)}` : ''}
            </span>
            <NextSendCountdown targetAt={campaign.next_send_at} running={campaign.status === 'ACTIVE'} />
          </div>
        ) : null}

        {stats ? (
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
            <Stat label="Total" value={stats.total} />
            <Stat label="Pendentes" value={stats.pending} tone="amber" />
            <Stat label="Enviados" value={stats.sent} />
            <Stat label="Respostas" value={stats.responded} tone="blue" />
            <Stat label="Interessados" value={stats.interested} tone="emerald" />
            <Stat label="Erros" value={stats.errors} tone="red" />
          </div>
        ) : null}

        <Card>
          <CardHeader title="Progresso" subtitle="Leads processados da fila" />
          <Progress value={stats?.processed ?? 0} max={Math.max(1, stats?.total ?? 1)} />
          <div className="mt-2 flex justify-between text-xs text-zinc-500">
            <span>{stats?.processed ?? 0} processados</span>
            <span>{(stats?.total ?? 0) - (stats?.processed ?? 0)} na fila</span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Ajustar limites" subtitle="Altere e clique em salvar" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Limite WhatsApp/dia" type="number" value={waLimit} onChange={(e) => setWaLimit(e.target.value)} placeholder={String(campaign?.daily_whatsapp_limit)} />
            <Input label="Limite E-mail/dia" type="number" value={emailLimit} onChange={(e) => setEmailLimit(e.target.value)} placeholder={String(campaign?.daily_email_limit)} />
            <Input label="Intervalo (s)" type="number" value={interval} onChange={(e) => setInterval(e.target.value)} placeholder={String(campaign?.interval_seconds)} />
            <Input
              label="Início diário (Brasília)"
              type="time"
              value={startHour}
              onChange={(e) => setStartHour(e.target.value)}
              placeholder={startHourToTimeInput(campaign?.start_hour ?? null)}
              hint={campaign?.start_hour != null ? `atual: ${startHourToTimeInput(campaign.start_hour)}` : 'sem janela configurada'}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => void saveLimits()} loading={saving}>
              Salvar
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Leads da campanha" subtitle={`${leads.data?.total ?? 0} leads`} />
          {leads.data && leads.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white text-[11px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3">Canal</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Tentativas</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.data.items.map((item) => (
                    <tr key={item.id} className="border-t border-zinc-200 hover:bg-zinc-100">
                      <td className="px-4 py-2.5 text-zinc-700">{item.lead.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{item.lead.business_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{item.lead.phone ?? item.lead.email ?? '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{item.channel ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{item.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-zinc-500">Nenhum lead nesta campanha. Importe uma lista e vincule a esta campanha.</div>
          )}
        </Card>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir campanha"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void deleteCampaign()} loading={deleting}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-500">
          Tem certeza que deseja excluir esta campanha? Os leads importados não são apagados — apenas o vínculo com esta campanha.
        </p>
      </Modal>
    </DashboardShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' | 'blue' | 'red' }) {
  const color = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : tone === 'blue' ? 'text-blue-600' : tone === 'red' ? 'text-red-600' : 'text-zinc-900';
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center">
      <div className={`font-display text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}
