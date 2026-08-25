'use client';

import { useState, useEffect } from 'react';
import { Bot, ShoppingCart, Headset, Handshake } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useApi, useApiMutationMethod, request } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';

interface AISettingsData {
  id: string;
  business_id: string;
  agent_id: string | null;
  tone: string;
  behaviors: Record<string, boolean>;
  message_config: Record<string, unknown>;
  custom_prompt: string | null;
  agent_mode: string;
  agent: { id: string; name: string; role: string | null; description: string | null; active: boolean } | null;
}

const AGENT_MODES = [
  {
    value: 'sales',
    label: 'Vendas',
    icon: ShoppingCart,
    title: 'Especialista em vendas',
    desc: 'Encontra oportunidades, apresenta soluções, trata objeções e conduz clientes até a conversão.',
  },
  {
    value: 'support',
    label: 'Suporte',
    icon: Headset,
    title: 'Especialista em atendimento',
    desc: 'Resolve dúvidas e problemas, orienta clientes e encaminha casos quando necessário.',
  },
  {
    value: 'sales_support',
    label: 'Vendas + Suporte',
    icon: Handshake,
    title: 'Atendimento completo',
    desc: 'Identifica automaticamente se o cliente precisa de suporte ou está pronto para comprar.',
  },
];

const TONES = [
  { value: 'PROFESSIONAL', label: 'Profissional' },
  { value: 'FRIENDLY', label: 'Amigável' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'RELAXED', label: 'Descontraído' },
  { value: 'PREMIUM', label: 'Premium' },
  { value: 'CONSULTATIVE', label: 'Consultivo' },
  { value: 'TECHNICAL', label: 'Técnico' },
];

const BEHAVIORS: { key: string; label: string }[] = [
  { key: 'natural', label: 'Ser natural' },
  { key: 'avoid_robotic', label: 'Evitar respostas robóticas' },
  { key: 'ask_questions', label: 'Fazer perguntas' },
  { key: 'identify_need', label: 'Identificar a necessidade do cliente' },
  { key: 'try_convert', label: 'Tentar converter' },
  { key: 'offer_products', label: 'Oferecer produtos/serviços' },
  { key: 'try_schedule', label: 'Tentar agendar' },
  { key: 'forward_to_human', label: 'Encaminhar para humano' },
  { key: 'use_emojis', label: 'Usar emojis' },
];

export default function AISettingsPage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useApi<AISettingsData>(['ai-settings'], 'ai/settings');

  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [agentDesc, setAgentDesc] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [tone, setTone] = useState('FRIENDLY');
  const [behaviors, setBehaviors] = useState<Record<string, boolean>>({});
  const [msgLength, setMsgLength] = useState('');
  const [msgSentences, setMsgSentences] = useState('');
  const [msgPerReply, setMsgPerReply] = useState('');
  const [maxEmojis, setMaxEmojis] = useState('');
  const [agentMode, setAgentMode] = useState('sales_support');

  useEffect(() => {
    if (!settings) return;
    setAgentId(settings.agent?.id ?? null);
    setAgentName(settings.agent?.name ?? '');
    setAgentRole(settings.agent?.role ?? '');
    setAgentDesc(settings.agent?.description ?? '');
    setTone(settings.tone);
    setBehaviors(settings.behaviors ?? {});
    setMsgLength(String((settings.message_config as any)?.max_length ?? ''));
    setMsgSentences(String((settings.message_config as any)?.max_sentences ?? ''));
    setMsgPerReply(String((settings.message_config as any)?.max_messages_per_reply ?? ''));
    setMaxEmojis(String((settings.message_config as any)?.max_emojis ?? ''));
    setAgentMode(settings.agent_mode ?? 'sales_support');
  }, [settings]);

  const saveMutation = useApiMutationMethod({
    onSuccess: () => {
      success('Configuração de IA salva');
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
    },
    onError: (err) => toastError(err.message),
  });

  const toggleBehavior = (key: string) => setBehaviors((b) => ({ ...b, [key]: !b[key] }));

  const save = async () => {
    const message_config: Record<string, unknown> = {};
    if (msgLength) message_config.max_length = Number(msgLength);
    if (msgSentences) message_config.max_sentences = Number(msgSentences);
    if (msgPerReply) message_config.max_messages_per_reply = Number(msgPerReply);
    if (maxEmojis) message_config.max_emojis = Number(maxEmojis);

    await saveMutation.mutateAsync({
      _method: 'PATCH',
      _path: 'ai/settings',
      tone,
      behaviors,
      message_config,
      agent_mode: agentMode,
    });

    // Atualiza/cria o agente de identidade e o vincula às configurações
    if (agentName.trim()) {
      const currentId = agentId ?? settings?.agent?.id ?? null;
      if (currentId) {
        await saveMutation.mutateAsync({
          _method: 'PATCH',
          _path: `ai/agents/${currentId}`,
          name: agentName,
          role: agentRole,
          description: agentDesc,
        });
      } else {
        const created = await saveMutation.mutateAsync({
          _method: 'POST',
          _path: 'ai/agents',
          name: agentName,
          role: agentRole,
          description: agentDesc,
        });
        const newId = (created as { id?: string } | null)?.id ?? null;
        if (newId) {
          setAgentId(newId);
          await saveMutation.mutateAsync({
            _method: 'PATCH',
            _path: 'ai/settings',
            agent_id: newId,
          });
        }
      }
    }
    void request('ai/settings');
  };

  if (isLoading) return <DashboardShell title="Configurar IA"><div className="text-sm text-zinc-500">Carregando...</div></DashboardShell>;

  return (
    <DashboardShell title="Configurar IA">
      <div className="mb-6">
        <h1 className="heading-strong text-xl">Configurar IA</h1>
        <p className="text-sm text-zinc-500">Defina a identidade, o tom e o comportamento do seu agente de atendimento</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Identidade do agente" subtitle="Quem é o agente que atende seus clientes" />
          <div className="space-y-4 p-5">
            <Input label="Nome do agente" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Ex.: Atendente virtual" />
            <Input label="Função" value={agentRole} onChange={(e) => setAgentRole(e.target.value)} placeholder="Ex.: Atendimento, Vendas, Suporte" />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Descrição</label>
              <textarea
                value={agentDesc}
                onChange={(e) => setAgentDesc(e.target.value)}
                rows={3}
                placeholder="Descreva o papel e a postura do agente..."
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Tom de voz" />
          <div className="p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTone(t.value)}
                  className={`rounded-xl border px-3 py-2.5 text-sm ${
                    tone === t.value ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600' : 'border-zinc-200 text-zinc-500 hover:border-zinc-400'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Objetivo do agente" subtitle="Defina como a IA deve atuar durante as conversas com seus clientes" />
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {AGENT_MODES.map((m) => {
                const Icon = m.icon;
                const active = agentMode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setAgentMode(m.value)}
                    aria-pressed={active}
                    className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all ${
                      active
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-emerald-600' : 'text-zinc-500'}`} />
                    <span className={`text-sm font-bold ${active ? 'text-emerald-700' : 'text-zinc-800'}`}>{m.label}</span>
                    <span className="text-xs font-medium text-zinc-600">{m.title}</span>
                    <span className="text-[11px] leading-relaxed text-zinc-500">{m.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Comportamento" subtitle="Como o agente deve se portar nas conversas" />
          <div className="grid gap-2 p-5 sm:grid-cols-2">
            {BEHAVIORS.map((b) => (
              <label key={b.key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 hover:border-zinc-400">
                <input type="checkbox" checked={Boolean(behaviors[b.key])} onChange={() => toggleBehavior(b.key)} className="h-4 w-4 accent-emerald-500" />
                <span className="text-sm text-zinc-700">{b.label}</span>
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Mensagens" subtitle="Tamanho e quantidade das mensagens geradas" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Input label="Tamanho máximo (caracteres)" type="number" value={msgLength} onChange={(e) => setMsgLength(e.target.value)} placeholder="ex.: 200" />
            <Input label="Máximo de frases por mensagem" type="number" value={msgSentences} onChange={(e) => setMsgSentences(e.target.value)} placeholder="ex.: 3" />
            <Input label="Mensagens por resposta" type="number" value={msgPerReply} onChange={(e) => setMsgPerReply(e.target.value)} placeholder="ex.: 1" />
            <Input label="Máximo de emojis por mensagem" type="number" value={maxEmojis} onChange={(e) => setMaxEmojis(e.target.value)} placeholder="ex.: 1" />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => { void request('ai/settings'); }}>
            Recarregar
          </Button>
          <Button onClick={() => void save()} loading={saveMutation.isPending}>
            <Bot className="mr-2 h-4 w-4" />
            Salvar configuração
          </Button>
        </div>
      </div>
    </DashboardShell>
  );
}