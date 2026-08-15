'use client';

import { useMemo } from 'react';
import { Bot, User, MessageSquare, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface Conversation {
  id: string;
  lead_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  business_name: string | null;
  lead_status: string;
  human_handled: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message?: { direction: string; content: string; created_at: string } | null;
}

interface InboxCardProps {
  conversation: Conversation;
  onOpen: () => void;
  onDelete?: () => void;
  highlighted?: boolean;
  unread?: boolean;
}

const STATUS_STYLES: Record<string, BadgeTone> = {
  AGENT_ACTIVE: { tone: 'violet', label: 'Em atendimento' },
  INTERESTED: { tone: 'emerald', label: 'Interessada' },
  RESPONDED: { tone: 'sky', label: 'Respondeu' },
  NOT_INTERESTED: { tone: 'zinc', label: 'Não interessada' },
  OPT_OUT: { tone: 'zinc', label: 'Opt-out' },
  PENDING: { tone: 'amber', label: 'Pendente' },
};

export type BadgeTone = { tone: 'emerald' | 'sky' | 'violet' | 'amber' | 'zinc'; label: string };

export function statusStyle(status: string): BadgeTone {
  const fallback: BadgeTone = { tone: 'zinc', label: status || '—' };
  const style = STATUS_STYLES[status];
  return style ? { tone: style.tone, label: style.label } : fallback;
}

/** Formata o timestamp como hora relativa ("há 2 min", "10:59", "ontem"). */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) {
    const today = new Date();
    const sameDay = today.toDateString() === date.toDateString();
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return sameDay ? time : `ontem · ${time}`;
  }

  if (diffH < 48) {
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `ontem · ${time}`;
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function InboxCard({ conversation: c, onOpen, onDelete, highlighted = false, unread = false }: InboxCardProps) {
  const initials = (c.lead_name?.[0] ?? '?').toUpperCase();
  const style = useMemo(() => statusStyle(c.lead_status), [c.lead_status]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Abrir conversa com ${c.lead_name ?? 'contato'}`}
      className={`group relative flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-zinc-50 hover:shadow-lg hover:shadow-zinc-900/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 active:scale-[0.98] ${
        highlighted ? 'inbox-card-flash' : 'border-zinc-200'
      }`}
    >
      {onDelete ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Excluir conversa com ${c.lead_name ?? 'contato'}`}
          title="Excluir conversa"
          className="absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-zinc-400 shadow-sm transition-colors hover:bg-red-500/10 hover:text-red-600 focus:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}

      {/* Cabeçalho: avatar grande + badge de status no topo direito */}
      <div className="flex items-start justify-between gap-2">
        <div className="relative shrink-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 text-base font-bold text-zinc-900 ring-1 ring-zinc-300 transition-transform group-hover:scale-105">
            {initials}
          </div>
          {unread && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-zinc-200" aria-label="Não lida" />}
        </div>
        <Badge tone={style.tone}>{style.label}</Badge>
      </div>

      {/* Identidade — ocupa o miolo (sem prévia de conversa) */}
      <div className="mt-1 flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-zinc-900">{c.lead_name ?? 'Contato'}</span>
          {c.human_handled ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600" title="Modo manual">
              <User className="h-2.5 w-2.5" /> humano
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600" title="Atendimento de IA">
              <Bot className="h-2.5 w-2.5" /> IA
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          {c.business_name ? <span className="truncate">{c.business_name}</span> : <MessageSquare className="h-3 w-3 shrink-0" />}
        </div>
      </div>
    </div>
  );
}