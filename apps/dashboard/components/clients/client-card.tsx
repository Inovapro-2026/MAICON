'use client';

import { useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/button';
import { statusStyle } from '@/components/inbox/inbox-card';

export interface Client {
  id: string;
  name: string | null;
  segment: string | null;
  status: string;
  business_name?: string | null;
}

interface ClientCardProps {
  client: Client;
  onOpen: () => void;
  opening?: boolean;
}

/**
 * Card de cliente — mesmo visual/estrutura dos cards de Mensagens para manter
 * as duas abas consistentes. Mostra apenas Nome, Segmento e Status/Interesse.
 */
export function ClientCard({ client, onOpen, opening = false }: ClientCardProps) {
  const initials = (client.name?.[0] ?? '?').toUpperCase();
  const style = useMemo(() => statusStyle(client.status), [client.status]);

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
      aria-label={`Abrir conversa com ${client.name ?? 'cliente'}`}
      className={`group relative flex aspect-square w-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C7D2FE] hover:shadow-[0_8px_24px_rgba(99,102,241,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/60 active:scale-[0.98] ${
        opening ? 'opacity-60' : 'border-[#E6E8F0]'
      }`}
    >
      {opening ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-xs">
          <Spinner className="h-6 w-6" />
        </div>
      ) : null}

      {/* Cabeçalho: avatar grande + badge de status no topo direito */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#6366F1] to-[#8B5CF6] text-sm font-bold text-white shadow-xs transition-transform group-hover:scale-105">
          {initials}
        </div>
        <Badge tone={style.tone}>{style.label}</Badge>
      </div>

      {/* Identidade — nome + segmento no miolo */}
      <div className="mt-2 flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span className="truncate font-bold text-[#0F172A]">{client.name ?? 'Contato'}</span>
        <div className="flex items-center gap-1 text-xs text-[#64748B]">
          {client.segment ? (
            <span className="truncate">{client.segment}</span>
          ) : client.business_name ? (
            <span className="truncate">{client.business_name}</span>
          ) : (
            <MessageSquare className="h-3 w-3 shrink-0 text-[#94A3B8]" />
          )}
        </div>
      </div>
    </div>
  );
}