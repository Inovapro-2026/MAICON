'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Play, Pause, RotateCcw, Square, Megaphone, Trash2 } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { useApi, request } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';
import { NextSendCountdown } from '@/components/countdown';
import { BrasiliaClock } from '@/components/brasilia-clock';

interface Campaign {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'FINISHED';
  daily_whatsapp_limit: number;
  daily_email_limit: number;
  interval_seconds: number;
  is_test: boolean;
  start_hour: number | null;
  next_send_at: string | null;
  stats: {
    total: number;
    processed: number;
    pending: number;
    responded: number;
    interested: number;
    errors: number;
  };
}

function startHourLabel(startHour: number | null): string | null {
  if (startHour === null || startHour === undefined) return null;
  const h = Math.floor(startHour / 60);
  const m = startHour % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}h`;
}

const STATUS_TONE: Record<string, 'emerald' | 'amber' | 'zinc'> = { ACTIVE: 'emerald', PAUSED: 'amber', FINISHED: 'zinc' };

export default function CampaignsPage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [waLimit, setWaLimit] = useState('30');
  const [emailLimit, setEmailLimit] = useState('100');
  const [interval, setInterval] = useState('7200');
  const [isTest, setIsTest] = useState(false);
  const [startHour, setStartHour] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const campaigns = useApi<Campaign[]>(['campaigns'], 'campaigns', { refetchInterval: 10000 });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['metrics'] });
  };

  const create = async () => {
    if (!name.trim()) {
      toastError('Informe o nome da campanha');
      return;
    }
    setSaving(true);
    try {
      await request('campaigns', {
        method: 'POST',
        body: {
          name,
          daily_whatsapp_limit: Number(waLimit),
          daily_email_limit: Number(emailLimit),
          interval_seconds: Number(interval),
          is_test: isTest,
          start_hour: startHour ? startHour : null,
        },
      });
      success('Campanha criada');
      setOpen(false);
      setName('');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao criar campanha');
    } finally {
      setSaving(false);
    }
  };

  const action = async (id: string, act: string) => {
    setActionId(id);
    try {
      await request(`campaigns/${id}/${act}`, { method: 'POST', body: {} });
      success(`Campanha ${act === 'start' ? 'iniciada' : act === 'pause' ? 'pausada' : act === 'resume' ? 'reaberta' : 'encerrada'}`);
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha na operação');
    } finally {
      setActionId(null);
    }
  };

  const removeCampaign = async () => {
    if (!deleteTarget) return;
    setActionId(deleteTarget.id);
    try {
      await request(`campaigns/${deleteTarget.id}`, { method: 'DELETE', body: {} });
      success('Campanha excluída');
      setDeleteTarget(null);
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao excluir');
    } finally {
      setActionId(null);
    }
  };

  return (
    <DashboardShell title="Campanhas">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <BrasiliaClock />
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nova campanha
          </Button>
        </div>

        {campaigns.data && campaigns.data.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {campaigns.data.map((c) => (
              <Card key={c.id} className="cursor-pointer hover:bg-zinc-100" onClick={() => router.push(`/campaigns/${c.id}`)}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-emerald-600" />
                      <span className="font-semibold text-zinc-900">{c.name}</span>
                      {c.is_test ? <Badge tone="blue">teste</Badge> : null}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      WA {c.daily_whatsapp_limit}/dia · E-mail {c.daily_email_limit}/dia · a cada {c.interval_seconds}s
                      {startHourLabel(c.start_hour) ? ` · inicia ${startHourLabel(c.start_hour)}` : ''}
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status === 'ACTIVE' ? 'Ativa' : c.status === 'PAUSED' ? 'Pausada' : 'Encerrada'}</Badge>
                </div>

                <Progress value={c.stats.processed} max={Math.max(1, c.stats.total)} />

                <div className="mt-2 flex items-center justify-between">
                  <NextSendCountdown targetAt={c.next_send_at} running={c.status === 'ACTIVE'} />
                  <span className="text-[11px] text-zinc-500">intervalo {c.interval_seconds}s</span>
                </div>

                <div className="mt-3 grid grid-cols-5 gap-2 text-center text-[11px] text-zinc-500">
                  <div><div className="font-semibold text-zinc-700">{c.stats.total}</div>total</div>
                  <div><div className="font-semibold text-zinc-700">{c.stats.pending}</div>fila</div>
                  <div><div className="font-semibold text-zinc-700">{c.stats.responded}</div>respostas</div>
                  <div><div className="font-semibold text-emerald-600">{c.stats.interested}</div>interes.</div>
                  <div><div className="font-semibold text-red-600">{c.stats.errors}</div>erros</div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {c.status === 'PAUSED' ? (
                    <Button size="sm" onClick={() => void action(c.id, 'start')} loading={actionId === c.id}>
                      <Play className="h-4 w-4" /> Iniciar
                    </Button>
                  ) : null}
                  {c.status === 'ACTIVE' ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => void action(c.id, 'pause')} loading={actionId === c.id}>
                        <Pause className="h-4 w-4" /> Pausar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void action(c.id, 'finish')} loading={actionId === c.id}>
                        <Square className="h-4 w-4" /> Encerrar
                      </Button>
                    </>
                  ) : null}
                  {c.status === 'FINISHED' ? (
                    <Button size="sm" variant="outline" onClick={() => void action(c.id, 'resume')} loading={actionId === c.id}>
                      <RotateCcw className="h-4 w-4" /> Reabrir
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-500/10 hover:text-red-600"
                    onClick={() => setDeleteTarget(c)}
                  >
                    <Trash2 className="h-4 w-4" /> Excluir
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="py-12 text-center">
            <div className="text-sm text-zinc-500">Nenhuma campanha criada ainda.</div>
            <Button className="mt-4" onClick={() => setOpen(true)}>
              Criar primeira campanha
            </Button>
          </Card>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova campanha"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void create()} loading={saving}>
              Criar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nome da campanha" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Barbearias SP — Agosto" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Limite WhatsApp/dia" type="number" value={waLimit} onChange={(e) => setWaLimit(e.target.value)} min={1} />
            <Input label="Limite E-mail/dia" type="number" value={emailLimit} onChange={(e) => setEmailLimit(e.target.value)} min={1} />
          </div>
          <Input label="Intervalo entre envios (segundos)" type="number" value={interval} onChange={(e) => setInterval(e.target.value)} min={5} hint="Recomendado: 7200s (2 horas) para WhatsApp" />
          <Input label="Início diário (horário de Brasília)" type="time" value={startHour} onChange={(e) => setStartHour(e.target.value)} hint="Ex.: 09:00 — a campanha começa a enviar nesse horário todos os dias" />
          <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3">
            <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
            <div>
              <div className="text-sm font-medium text-zinc-700">Campanha de teste</div>
              <div className="text-[11px] text-zinc-500">Usa limites reduzidos para validação</div>
            </div>
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Excluir campanha"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void removeCampaign()} loading={actionId === deleteTarget?.id}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-500">
          Tem certeza que deseja excluir a campanha <strong className="text-zinc-900">{deleteTarget?.name}</strong>?
          Os leads importados não são apagados — apenas o vínculo com esta campanha.
        </p>
      </Modal>
    </DashboardShell>
  );
}
