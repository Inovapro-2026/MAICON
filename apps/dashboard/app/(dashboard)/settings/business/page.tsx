'use client';

import { useState } from 'react';
import { Save, Building2 } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useApi, useApiMutationMethod, request } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';

const SEGMENTS = [
  'Barbearia',
  'Salão de beleza',
  'Clínica',
  'Restaurante',
  'Imobiliária',
  'Loja',
  'Oficina',
  'Agência',
  'Prestador de serviços',
  'E-commerce',
  'Consultoria',
  'Outro',
];

interface BusinessSettings {
  name: string;
  legal_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  segment: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  instagram: string | null;
  opening_hours: string | null;
  timezone: string;
  logo_url: string | null;
  additional_info: string | null;
  limits: { whatsapp_daily_limit: number; email_daily_limit: number; interval_seconds: number; test_mode_max_leads: number };
}

const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Bahia', 'America/Recife', 'America/Porto_Velho', 'America/Cuiaba', 'America/Campo_Grande', 'America/Noronha'];

export default function BusinessSettingsPage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const business = useApi<BusinessSettings>(['business-settings'], 'business/settings');
  const settings = business.data;

  const [form, setForm] = useState<Record<string, string>>({});

  const saveMutation = useApiMutationMethod({
    onSuccess: () => {
      success('Dados da empresa salvos');
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
    },
    onError: (err) => toastError(err.message),
  });

  const setField = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const fieldValue = (key: keyof BusinessSettings) => {
    if (form[key] !== undefined) return form[key];
    const v = settings?.[key];
    return v == null ? '' : String(v);
  };

  const save = async () => {
    await saveMutation.mutateAsync({
      _method: 'PATCH',
      _path: 'business/settings',
      name: form.name !== undefined ? form.name || settings?.name : undefined,
      segment: form.segment !== undefined ? form.segment : undefined,
      description: form.description !== undefined ? form.description : undefined,
      email: form.email !== undefined ? form.email : undefined,
      phone: form.phone !== undefined ? form.phone : undefined,
      address: form.address !== undefined ? form.address : undefined,
      website: form.website !== undefined ? form.website : undefined,
      instagram: form.instagram !== undefined ? form.instagram : undefined,
      opening_hours: form.opening_hours !== undefined ? form.opening_hours : undefined,
      timezone: form.timezone !== undefined ? form.timezone : undefined,
      logo_url: form.logo_url !== undefined ? form.logo_url : undefined,
      additional_info: form.additional_info !== undefined ? form.additional_info : undefined,
    });
    void request('business/settings');
  };

  const loading = business.isLoading;

  return (
    <DashboardShell title="Meu negócio">
      <div className="mb-6">
        <h1 className="heading-strong text-xl">Meu negócio</h1>
        <p className="text-sm text-zinc-500">Dados gerais da sua empresa — usados pela IA para personalizar o atendimento</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Identificação" />
          <div className="space-y-4 p-5">
            <Input label="Nome da empresa" value={fieldValue('name')} onChange={(e) => setField('name', e.target.value)} placeholder="Ex.: Barbearia Central" disabled={loading} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Segmento</label>
                <select
                  value={fieldValue('segment')}
                  onChange={(e) => setField('segment', e.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
                >
                  <option value="">Selecione...</option>
                  {SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Input label="Telefone" value={fieldValue('phone')} onChange={(e) => setField('phone', e.target.value)} placeholder="(11) 99999-0000" disabled={loading} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="E-mail" type="email" value={fieldValue('email')} onChange={(e) => setField('email', e.target.value)} placeholder="contato@empresa.com" disabled={loading} />
              <Input label="CNPJ" value={fieldValue('cnpj')} onChange={(e) => setField('cnpj', e.target.value)} placeholder="00.000.000/0000-00" disabled={loading} />
            </div>
            <Input label="Descrição" value={fieldValue('description')} onChange={(e) => setField('description', e.target.value)} placeholder="Descreva o que sua empresa faz..." disabled={loading} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Presença e localização" />
          <div className="space-y-4 p-5">
            <Input label="Endereço" value={fieldValue('address')} onChange={(e) => setField('address', e.target.value)} placeholder="Rua, número, bairro, cidade..." disabled={loading} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Site" value={fieldValue('website')} onChange={(e) => setField('website', e.target.value)} placeholder="https://..." disabled={loading} />
              <Input label="Instagram" value={fieldValue('instagram')} onChange={(e) => setField('instagram', e.target.value)} placeholder="@suaempresa" disabled={loading} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Horário de funcionamento" value={fieldValue('opening_hours')} onChange={(e) => setField('opening_hours', e.target.value)} placeholder="Seg a Sex 9h–18h, Sáb 9h–13h" disabled={loading} />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Fuso horário</label>
                <select
                  value={fieldValue('timezone')}
                  onChange={(e) => setField('timezone', e.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
                >
                  {TIMEZONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Input label="Logo (URL)" value={fieldValue('logo_url')} onChange={(e) => setField('logo_url', e.target.value)} placeholder="https://.../logo.png" disabled={loading} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Informações adicionais" />
          <div className="space-y-4 p-5">
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">Informações adicionais</label>
            <textarea
              value={fieldValue('additional_info')}
              onChange={(e) => setField('additional_info', e.target.value)}
              disabled={loading}
              rows={4}
              placeholder="Informações complementares sobre sua empresa, diferenciais, observações..."
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-emerald-500/60"
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => void save()} loading={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            Salvar alterações
          </Button>
        </div>
      </div>
    </DashboardShell>
  );
}