'use client';

import { useState } from 'react';
import { MessageCircle, AlertOctagon, Save, Eraser } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useApi, request } from '@/hooks/use-api';
import { useQueryClient } from '@tanstack/react-query';
import { useSession, isBusinessOwnerOrAdmin } from '@/hooks/use-session';

interface WaStatus {
  connected: boolean;
  state: string;
  qrAvailable: boolean;
  qr: string | null;
  qrDataUrl: string | null;
  loggedIn: boolean;
  phone: string | null;
}

interface Settings {
  whatsapp_daily_limit: number;
  email_daily_limit: number;
  interval_seconds: number;
  test_mode_max_leads: number;
}

export default function SettingsPage() {
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [waLimit, setWaLimit] = useState('');
  const [emailLimit, setEmailLimit] = useState('');
  const [interval, setInterval] = useState('');
  const [saving, setSaving] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  const [clearSessionOpen, setClearSessionOpen] = useState(false);
  const [clearingSession, setClearingSession] = useState(false);

  const wa = useApi<WaStatus>(['whatsapp-status'], 'whatsapp/status', { refetchInterval: 5000 });
  const settings = useApi<Settings>(['settings'], 'dashboard/settings');
  const { user } = useSession();
  const canAdmin = isBusinessOwnerOrAdmin(user?.businessRole);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['metrics'] });
    queryClient.invalidateQueries({ queryKey: ['settings'] });
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await request('dashboard/settings', {
        method: 'PUT',
        body: {
          ...(waLimit ? { whatsapp_daily_limit: Number(waLimit) } : {}),
          ...(emailLimit ? { email_daily_limit: Number(emailLimit) } : {}),
          ...(interval ? { interval_seconds: Number(interval) } : {}),
        },
      });
      success('Configurações salvas');
      setWaLimit('');
      setEmailLimit('');
      setInterval('');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const waConnect = async () => {
    setWaBusy(true);
    try {
      await request('whatsapp/connect', { method: 'POST', body: {} });
      success('Conexão solicitada. Escaneie o QR code abaixo.');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao conectar WhatsApp');
    } finally {
      setWaBusy(false);
    }
  };

  const waDisconnect = async () => {
    setWaBusy(true);
    try {
      await request('whatsapp/disconnect', { method: 'POST', body: {} });
      success('Sessão encerrada');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao desconectar');
    } finally {
      setWaBusy(false);
    }
  };

  const waClearSession = async () => {
    setClearingSession(true);
    try {
      await request('whatsapp/clear-session', { method: 'POST', body: {} });
      success('Sessão limpa. Conecte novamente para gerar um QR novo.');
      setClearSessionOpen(false);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao limpar sessão');
    } finally {
      setClearingSession(false);
    }
  };

  const pauseAll = async () => {
    try {
      await request('campaigns/pause-all', { method: 'POST', body: {} });
      success('Todas as campanhas pausadas');
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao pausar');
    }
  };

  return (
    <DashboardShell title="Configurações">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="WhatsApp (Baileys)"
            subtitle="Sessão persistente no servidor — escaneie o QR para conectar"
            action={
              <Badge tone={wa.data?.connected ? 'emerald' : wa.data?.qrAvailable ? 'amber' : 'zinc'}>
                {wa.data?.connected ? 'Conectado' : wa.data?.qrAvailable ? 'Aguardando QR' : 'Desconectado'}
              </Badge>
            }
          />
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {wa.data?.qrDataUrl && !wa.data.connected ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wa.data.qrDataUrl} alt="QR code do WhatsApp" className="h-64 w-64" />
              </div>
            ) : (
              <div className="flex h-64 w-64 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white p-4 text-center">
                <MessageCircle className="mb-2 h-8 w-8 text-zinc-500" />
                <div className="text-sm text-zinc-500">
                  {wa.data?.connected ? `Conectado como ${wa.data.phone ?? ''}` : wa.data?.state === 'connecting' ? 'Conectando…' : 'Sem sessão ativa'}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {!wa.data?.connected ? (
                <Button onClick={() => void waConnect()} loading={waBusy} disabled={wa.data?.state === 'connecting'}>
                  Conectar WhatsApp
                </Button>
              ) : (
                <Button variant="danger" onClick={() => void waDisconnect()} loading={waBusy}>
                  Desconectar
                </Button>
              )}
              {canAdmin ? (
                <Button variant="outline" className="text-red-600 hover:bg-red-500/10 hover:text-red-600" onClick={() => setClearSessionOpen(true)} disabled={clearingSession}>
                  <Eraser className="h-4 w-4" /> Limpar sessão
                </Button>
              ) : null}
              <p className="max-w-xs text-[11px] text-zinc-500">
                Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho → Escaneie o QR.
                A sessão fica salva em {process.env.NEXT_PUBLIC_WHATSAPP_SESSION || 'diretório seguro no servidor'}.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Limites e intervalo" subtitle="Valores padrão para novas campanhas" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Limite WhatsApp/dia"
              type="number"
              value={waLimit}
              onChange={(e) => setWaLimit(e.target.value)}
              placeholder={String(settings.data?.whatsapp_daily_limit ?? 30)}
            />
            <Input
              label="Limite E-mail/dia"
              type="number"
              value={emailLimit}
              onChange={(e) => setEmailLimit(e.target.value)}
              placeholder={String(settings.data?.email_daily_limit ?? 100)}
            />
            <Input
              label="Intervalo entre envios (s)"
              type="number"
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              placeholder={String(settings.data?.interval_seconds ?? 7200)}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => void saveSettings()} loading={saving}>
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Parada de emergência" subtitle="Pausa imediatamente todas as campanhas ativas" />
          <Button variant="danger" onClick={() => void pauseAll()}>
            <AlertOctagon className="h-4 w-4" /> Pausar todas as campanhas
          </Button>
        </Card>
      </div>

      <ConfirmModal
        open={clearSessionOpen}
        title="Limpar sessão do WhatsApp"
        confirmText="EXCLUIR"
        confirmLabel="Limpar sessão"
        loading={clearingSession}
        onCancel={() => setClearSessionOpen(false)}
        onConfirm={() => void waClearSession()}
        message={
          <span>
            Todos os dados da sessão do WhatsApp desta empresa serão{' '}
            <strong className="text-red-600">apagados permanentemente do servidor</strong>. O aparelho atualmente pareado será
            deslogado e você precisará escanear um QR code novo. Digite{' '}
            <strong className="text-zinc-900">EXCLUIR</strong> para confirmar.
          </span>
        }
      />
    </DashboardShell>
  );
}
