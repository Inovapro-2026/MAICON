'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Play, Pause, Square, RotateCcw, Trash2, Mail, Eye, MessageCircle } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input, Textarea } from '@/components/ui/input';
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
    channel_mode: 'WHATSAPP' | 'EMAIL' | 'BOTH';
    email_subject: string | null;
    email_body: string | null;
    wa_first_message: string | null;
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

const CHANNEL_MODE_OPTIONS: Array<{ value: 'WHATSAPP' | 'EMAIL' | 'BOTH'; label: string; hint: string }> = [
  { value: 'WHATSAPP', label: 'WhatsApp', hint: 'envia só WhatsApp' },
  { value: 'EMAIL', label: 'E-mail', hint: 'envia só e-mail' },
  { value: 'BOTH', label: 'Ambos', hint: 'usa os dois canais quando o lead tiver os dados' },
];

const CHANNEL_LABEL: Record<string, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', BOTH: 'Ambos' };

/** Renderiza {{nome}}, {{empresa}}, {{email}}, {{telefone}} para a pré-visualização. */
function renderPreview(text: string, lead: { name?: string | null; business_name?: string | null; email?: string | null; phone?: string | null }): string {
  return text
    .replaceAll('{{nome}}', lead.name?.trim() || '')
    .replaceAll('{{empresa}}', lead.business_name?.trim() || '')
    .replaceAll('{{email}}', lead.email?.trim() || '')
    .replaceAll('{{telefone}}', lead.phone?.trim() || '');
}

const EMAIL_CONFIG_REQUIRED_MSG = 'Configure o assunto e a mensagem do e-mail antes de iniciar a campanha.';

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
  const [savingMode, setSavingMode] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [waFirstMessage, setWaFirstMessage] = useState('');
  const [savingWaMessage, setSavingWaMessage] = useState(false);
  const [waPreviewOpen, setWaPreviewOpen] = useState(false);

  const campaign = detail.data?.campaign;
  const stats = detail.data?.stats;
  const needsEmailConfig = campaign?.channel_mode === 'EMAIL' || campaign?.channel_mode === 'BOTH';
  const needsWaConfig = campaign?.channel_mode === 'WHATSAPP' || campaign?.channel_mode === 'BOTH';

  // Sincroniza o formulário de e-mail com a campanha carregada (sem sobrescrever
  // enquanto o usuário digita: só reseta quando os valores do servidor mudam).
  useEffect(() => {
    setEmailSubject(detail.data?.campaign.email_subject ?? '');
    setEmailBody(detail.data?.campaign.email_body ?? '');
    setWaFirstMessage(detail.data?.campaign.wa_first_message ?? '');
  }, [detail.data?.campaign.id, detail.data?.campaign.email_subject, detail.data?.campaign.email_body, detail.data?.campaign.wa_first_message]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign', id] });
    queryClient.invalidateQueries({ queryKey: ['campaign-leads', id] });
    queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  };

  const action = async (act: string) => {
    // Canal EMAIL/BOTH não inicia sem assunto e mensagem configurados.
    if ((act === 'start' || act === 'resume') && campaign) {
      const subj = (emailSubject.trim() || campaign.email_subject || '').trim();
      const body = (emailBody.trim() || campaign.email_body || '').trim();
      if (needsEmailConfig && (!subj || !body)) {
        toastError(EMAIL_CONFIG_REQUIRED_MSG);
        return;
      }
    }
    try {
      await request(`campaigns/${id}/${act}`, { method: 'POST', body: {} });
      success('Operação realizada');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha na operação');
    }
  };

  const saveEmailMessage = async () => {
    setSavingEmail(true);
    try {
      await request(`campaigns/${id}`, {
        method: 'PATCH',
        body: { email_subject: emailSubject.trim(), email_body: emailBody.trim() },
      });
      success('Mensagem do e-mail salva');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao salvar mensagem');
    } finally {
      setSavingEmail(false);
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

  const saveWaMessage = async () => {
    setSavingWaMessage(true);
    try {
      await request(`campaigns/${id}`, {
        method: 'PATCH',
        body: { wa_first_message: waFirstMessage.trim() },
      });
      success(waFirstMessage.trim() ? 'Mensagem de abordagem (WhatsApp) salva' : 'Mensagem de abordagem (WhatsApp) removida — voltou ao padrão');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao salvar mensagem');
    } finally {
      setSavingWaMessage(false);
    }
  };

  const changeChannelMode = async (mode: 'WHATSAPP' | 'EMAIL' | 'BOTH') => {
    if (!campaign || campaign.channel_mode === mode) return;
    setSavingMode(true);
    try {
      await request(`campaigns/${id}`, { method: 'PATCH', body: { channel_mode: mode } });
      success('Canal de envio atualizado');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao atualizar canal');
    } finally {
      setSavingMode(false);
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
        <div className="flex flex-wrap items-center justify-end gap-3">
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
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={campaign.status === 'ACTIVE' ? 'emerald' : campaign.status === 'PAUSED' ? 'amber' : 'zinc'}>
                {campaign.status === 'ACTIVE' ? 'Ativa' : campaign.status === 'PAUSED' ? 'Pausada' : 'Encerrada'}
              </Badge>
              {campaign.is_test ? <Badge tone="blue">teste</Badge> : null}
              <span className="text-xs font-medium text-[#64748B]">
                Canal {CHANNEL_LABEL[campaign.channel_mode] ?? campaign.channel_mode} · Limite WA {campaign.daily_whatsapp_limit}/dia · E-mail {campaign.daily_email_limit}/dia · intervalo {campaign.interval_seconds}s
                {campaign.start_hour != null ? ` · inicia ${startHourToTimeInput(campaign.start_hour)}` : ''}
              </span>
            </div>

            {/* Contador Regressivo em Destaque */}
            <NextSendCountdown
              targetAt={campaign.next_send_at}
              status={campaign.status}
              running={campaign.status === 'ACTIVE'}
              variant="prominent"
              onZero={() => void detail.refetch()}
            />
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
          <CardHeader title="Canal de envio" subtitle="Escolha por qual canal a campanha dispara — vale para os próximos envios da fila" />
          <div className="flex flex-wrap gap-2">
            {CHANNEL_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.hint}
                disabled={savingMode}
                onClick={() => void changeChannelMode(opt.value)}
                className={`h-9 rounded-full px-4 text-xs font-semibold transition-all duration-150 disabled:opacity-60 ${
                  campaign?.channel_mode === opt.value
                    ? 'bg-[#EEF2FF] text-[#6366F1] border border-[#C7D2FE] shadow-xs'
                    : 'bg-white text-[#64748B] border border-[#E6E8F0] hover:bg-slate-50 hover:text-[#0F172A]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#64748B]">
            "Ambos" envia pelos dois canais: leads com só telefone recebem WhatsApp, com só e-mail recebem e-mail, e com os dois recebem nos dois. Os limites diários de cada canal continuam valendo.
          </p>
        </Card>

        {needsWaConfig ? (
          <Card>
            <CardHeader
              title="Mensagem de abordagem (WhatsApp)"
              subtitle="Primeiro contato enviado por WhatsApp para cada lead — vale para os próximos envios da fila"
            />
            <div className="space-y-3">
              <Textarea
                label="Mensagem"
                value={waFirstMessage}
                onChange={(e) => setWaFirstMessage(e.target.value)}
                placeholder={'Digite a primeira mensagem de abordagem...\n\nEx.: Olá {{nome}}, tudo bem? Falo com o responsável pela {{empresa}}?'}
                rows={4}
              />
              <p className="text-[11px] text-[#64748B]">
                Variáveis disponíveis: {'{{nome}}'} · {'{{empresa}}'} · {'{{email}}'} · {'{{telefone}}'} — preenchidas com os dados de cada lead no momento do envio.
              </p>
              {waFirstMessage.trim() ? (
                <p className="text-[11px] font-semibold text-amber-600">
                  Mensagem personalizada ativa. Para voltar ao padrão, limpe o campo e salve.
                </p>
              ) : (
                <p className="text-[11px] text-[#64748B]">
                  Em branco, a campanha usa a mensagem padrão:{' '}
                  <span className="font-medium text-[#0F172A]">
                    "Oi, tudo bem? Falo com o responsável pelo estabelecimento?"
                  </span>
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setWaPreviewOpen(true)} disabled={!waFirstMessage.trim()}>
                  <Eye className="h-4 w-4 mr-1.5" /> Pré-visualizar
                </Button>
                <Button onClick={() => void saveWaMessage()} loading={savingWaMessage}>
                  <MessageCircle className="h-4 w-4 mr-1.5" /> Salvar mensagem
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {needsEmailConfig ? (
          <Card>
            <CardHeader
              title="Configuração do E-mail"
              subtitle="Mensagem enviada para o e-mail dos leads da campanha — vale para os próximos envios da fila"
            />
            <div className="space-y-3">
              <Input
                label="Assunto"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Digite o assunto do e-mail"
              />
              <Textarea
                label="Mensagem"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder={'Digite a mensagem que será enviada para os leads da campanha...\n\nEx.: Olá {{nome}}, tudo bem?\nConheça uma solução para a {{empresa}}...'}
                rows={8}
              />
              <p className="text-[11px] text-[#64748B]">
                Variáveis disponíveis: {'{{nome}}'} · {'{{empresa}}'} · {'{{email}}'} · {'{{telefone}}'} — preenchidas com os dados de cada lead no momento do envio.
              </p>
              {!emailSubject.trim() || !emailBody.trim() ? (
                <p className="text-[11px] font-semibold text-amber-600">
                  Assunto e mensagem são obrigatórios para iniciar a campanha neste canal.
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!emailBody.trim()}>
                  <Eye className="h-4 w-4 mr-1.5" /> Pré-visualizar e-mail
                </Button>
                <Button onClick={() => void saveEmailMessage()} loading={savingEmail}>
                  <Mail className="h-4 w-4 mr-1.5" /> Salvar mensagem
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

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
            <div className="overflow-x-auto rounded-xl border border-[#E6E8F0]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3">Canal</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Tentativas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6E8F0] bg-white">
                  {leads.data.items.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-[#0F172A]">{item.lead.name ?? '—'}</td>
                      <td className="px-4 py-3 text-[#475569]">{item.lead.business_name ?? '—'}</td>
                      <td className="px-4 py-3 text-[#64748B]">{item.lead.phone ?? item.lead.email ?? '—'}</td>
                      <td className="px-4 py-3 text-[#475569]">{item.channel ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3 text-[#64748B]">{item.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-[#64748B]">Nenhum lead nesta campanha. Importe uma lista e vincule a esta campanha.</div>
          )}
        </Card>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Pré-visualizar e-mail"
        footer={
          <Button variant="outline" onClick={() => setPreviewOpen(false)}>
            Fechar
          </Button>
        }
      >
        {(() => {
          const sample =
            leads.data?.items[0]?.lead ??
            ({ name: 'Maria Silva', business_name: 'Empresa Exemplo', email: 'maria@exemplo.com.br', phone: '+55 11 99999-0000' } as const);
          return (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#E6E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Assunto</div>
                <div className="mt-1 text-sm font-semibold text-[#0F172A]">{renderPreview(emailSubject, sample) || '(sem assunto)'}</div>
              </div>
              <div className="rounded-xl border border-[#E6E8F0] bg-white p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Mensagem</div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-[#334155]">{renderPreview(emailBody, sample)}</pre>
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Prévia gerada com dados de exemplo{leads.data?.items[0]?.lead.name ? ` (${leads.data.items[0].lead.name})` : ''}. A mensagem salva não é alterada.
              </p>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={waPreviewOpen}
        onClose={() => setWaPreviewOpen(false)}
        title="Pré-visualizar mensagem de WhatsApp"
        footer={
          <Button variant="outline" onClick={() => setWaPreviewOpen(false)}>
            Fechar
          </Button>
        }
      >
        {(() => {
          const sample =
            leads.data?.items[0]?.lead ??
            ({ name: 'Maria Silva', business_name: 'Empresa Exemplo', email: 'maria@exemplo.com.br', phone: '+55 11 99999-0000' } as const);
          return (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#E6E8F0] bg-white p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Mensagem</div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-[#334155]">{renderPreview(waFirstMessage, sample)}</pre>
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Prévia gerada com dados de exemplo{leads.data?.items[0]?.lead.name ? ` (${leads.data.items[0].lead.name})` : ''}. A mensagem salva não é alterada.
              </p>
            </div>
          );
        })()}
      </Modal>

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
        <p className="text-sm text-[#475569]">
          Tem certeza que deseja excluir esta campanha? Os leads importados não são apagados — apenas o vínculo com esta campanha.
        </p>
      </Modal>
    </DashboardShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' | 'blue' | 'red' }) {
  const color = tone === 'emerald' ? 'text-[#10B981]' : tone === 'amber' ? 'text-[#F59E0B]' : tone === 'blue' ? 'text-[#3B82F6]' : tone === 'red' ? 'text-[#EF4444]' : 'text-[#0F172A]';
  return (
    <div className="rounded-2xl border border-[#E6E8F0] bg-white p-3.5 text-center shadow-xs">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-[#64748B]">{label}</div>
    </div>
  );
}

