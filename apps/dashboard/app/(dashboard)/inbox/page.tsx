'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Trash2 } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useApi, request } from '@/hooks/use-api';
import { useRealtime } from '@/hooks/use-realtime';
import { useSession, isBusinessOwnerOrAdmin } from '@/hooks/use-session';
import { InboxCard, Conversation } from '@/components/inbox/inbox-card';
import { InboxSkeletonCards } from '@/components/inbox/skeleton-cards';
import type { RealtimeEventMessage } from '@/lib/realtime';

const FILTERS = [
  { key: 'sent', label: 'Enviado' },
  { key: 'responded', label: 'Respondido' },
  { key: 'manual', label: 'Manual' },
  { key: 'closed', label: 'Encerradas' },
];

const HIGHLIGHT_MS = 600;
const UNSEEN_KEY = 'acp_inbox_unseen_v1';

function readUnseen(): Set<string> {
  try {
    const raw = localStorage.getItem(UNSEEN_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return new Set();
    return new Set(list.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function writeUnseen(unseen: Set<string>): void {
  try {
    if (unseen.size === 0) localStorage.removeItem(UNSEEN_KEY);
    else localStorage.setItem(UNSEEN_KEY, JSON.stringify([...unseen]));
  } catch {
    // localStorage indisponível — ignora
  }
}

export default function InboxPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const { user } = useSession();
  const [filter, setFilter] = useState('sent');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [unseen, setUnseen] = useState<Set<string>>(() => readUnseen());
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const conversations = useApi<{ total: number; conversations: Conversation[] }>(
    ['conversations', filter],
    `conversations?filter=${filter}&pageSize=100`,
    { refetchInterval: 15000 }
  );

  const list = useMemo(() => conversations.data?.conversations ?? [], [conversations.data]);

  const canAdmin = isBusinessOwnerOrAdmin(user?.businessRole);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['metrics'] });
  }, [queryClient]);

  const now = () => new Date().toISOString();

  const markUnseen = useCallback((conversationId: string) => {
    setUnseen((prev) => {
      const next = new Set(prev);
      next.add(conversationId);
      writeUnseen(next);
      return next;
    });
  }, []);

  const markSeen = useCallback((conversationId: string) => {
    setUnseen((prev) => {
      if (!prev.has(conversationId)) return prev;
      const next = new Set(prev);
      next.delete(conversationId);
      writeUnseen(next);
      return next;
    });
  }, []);

  const flash = useCallback((conversationId: string) => {
    setHighlightedId(conversationId);
    window.setTimeout(() => setHighlightedId((current) => (current === conversationId ? null : current)), HIGHLIGHT_MS);
  }, []);

  /** Aplica o evento no cache otimista e reorganiza por última interação. */
  const applyEvent = useCallback(
    (event: RealtimeEventMessage) => {
      // Eventos de conversa sempre carregam conversationId/leadId.
      if (!event.conversationId || !event.leadId) return;
      const queryKey = ['conversations', filter];
      const cached = queryClient.getQueryData<{ total: number; conversations: Conversation[] }>(queryKey);
      if (!cached) return;

      const nowIso = event.timestamp || now();
      const next = cached.conversations.map((c) => {
        if (c.id !== event.conversationId && c.lead_id !== event.leadId) return c;
        const updated: Conversation = { ...c, last_message_at: nowIso };
        if (event.payload?.content) {
          updated.last_message_preview = event.payload.content.slice(0, 120);
          updated.last_message = {
            direction: event.payload.direction ?? c.last_message?.direction ?? 'IN',
            content: event.payload.content,
            created_at: nowIso,
          };
        }
        if (event.payload?.lead_status) updated.lead_status = event.payload.lead_status;
        if (typeof event.payload?.human_handled === 'boolean') updated.human_handled = event.payload.human_handled;
        return updated;
      });

      next.sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));

      queryClient.setQueryData(queryKey, { ...cached, conversations: next });

      if (event.payload?.direction === 'IN') markUnseen(event.conversationId);
      flash(event.conversationId);
    },
    [queryClient, filter, markUnseen, flash, now]
  );

  useRealtime({
    new_message_received: applyEvent,
    ai_response_generated: applyEvent,
    status_changed: applyEvent,
  });

  // Mantém tempos relativos atualizados a cada minuto
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const openConversation = useCallback(
    (c: Conversation) => {
      markSeen(c.id);
      router.push(`/inbox/${c.id}`);
    },
    [markSeen, router]
  );

  const removeConversation = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await request(`conversations/${deleteTarget.id}`, { method: 'DELETE', body: {} });
      success('Conversa excluída');
      setDeleteTarget(null);
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao excluir conversa');
    } finally {
      setDeleting(false);
    }
  };

  const clearAll = async () => {
    setDeleting(true);
    try {
      const res = await request<{ deleted: number }>('conversations', { method: 'DELETE', body: {} });
      success(`${res.deleted} conversa${res.deleted === 1 ? '' : 's'} excluída${res.deleted === 1 ? '' : 's'}`);
      setClearAllOpen(false);
      invalidate();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Falha ao limpar conversas');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardShell title="Mensagens">
      <div className="space-y-4">
        {/* Filtros — carrossel horizontal no mobile */}
        <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-thin lg:mx-0 lg:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex w-max gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`h-9 shrink-0 rounded-full px-4 text-xs font-semibold transition-colors ${
                  filter === f.key
                    ? 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {conversations.isLoading ? (
          <InboxSkeletonCards />
        ) : list.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-500">
                {conversations.data?.total ?? list.length} conversa{list.length === 1 ? '' : 's'}
              </p>
              {canAdmin ? (
                <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-500/10 hover:text-red-600" onClick={() => setClearAllOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Limpar tudo
                </Button>
              ) : null}
            </div>
            {/* Grid responsivo de cards quadrados */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((c) => (
                <InboxCard
                  key={c.id}
                  conversation={c}
                  onOpen={() => openConversation(c)}
                  onDelete={() => setDeleteTarget(c)}
                  highlighted={highlightedId === c.id}
                  unread={unseen.has(c.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <Card className="py-16 text-center">
            <MessageSquare className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
            <div className="text-sm text-zinc-500">Nenhuma conversa neste filtro.</div>
          </Card>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir conversa"
        confirmLabel="Excluir"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void removeConversation()}
        message={
          <span>
            Excluir a conversa com <strong className="text-zinc-900">{deleteTarget?.lead_name ?? 'contato'}</strong>?{' '}
            <strong className="text-red-600">Esta ação não pode ser desfeita.</strong>
          </span>
        }
      />

      <ConfirmModal
        open={clearAllOpen}
        title="Limpar todas as conversas"
        confirmText="EXCLUIR"
        confirmLabel="Limpar tudo"
        loading={deleting}
        onCancel={() => setClearAllOpen(false)}
        onConfirm={() => void clearAll()}
        message={
          <span>
            Você está prestes a excluir <strong className="text-red-600">{conversations.data?.total ?? 0} conversas</strong>{' '}
            com todos os históricos de mensagens desta empresa. Digite <strong className="text-zinc-900">EXCLUIR</strong> para confirmar.
            Esta ação não pode ser desfeita.
          </span>
        }
      />
    </DashboardShell>
  );
}