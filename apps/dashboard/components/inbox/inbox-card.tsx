"use client";

import { useMemo, useState } from "react";
import { Bot, User, Phone, Flame, MoreVertical, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface Conversation {
  id: string;
  lead_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  business_name: string | null;
  lead_segment?: string | null;
  lead_score?: number | null;
  lead_status: string;
  human_handled: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message?: {
    direction: string;
    content: string;
    created_at: string;
  } | null;
}

interface InboxCardProps {
  conversation: Conversation;
  onOpen: () => void;
  onDelete?: () => void;
  highlighted?: boolean;
  unread?: boolean;
}

const STATUS_STYLES: Record<string, BadgeTone> = {
  AGENT_ACTIVE: { tone: "violet", label: "Em atendimento" },
  INTERESTED: { tone: "emerald", label: "Interessada" },
  RESPONDED: { tone: "sky", label: "Respondeu" },
  NOT_INTERESTED: { tone: "zinc", label: "Não interessada" },
  OPT_OUT: { tone: "zinc", label: "Opt-out" },
  PENDING: { tone: "amber", label: "Pendente" },
};

export type BadgeTone = {
  tone: "emerald" | "sky" | "violet" | "amber" | "zinc";
  label: string;
};

export function statusStyle(status: string): BadgeTone {
  const fallback: BadgeTone = { tone: "zinc", label: status || "—" };
  const style = STATUS_STYLES[status];
  return style ? { tone: style.tone, label: style.label } : fallback;
}

/** Formata o timestamp como hora relativa ("há 2 min", "10:59", "ontem"). */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) {
    const today = new Date();
    const sameDay = today.toDateString() === date.toDateString();
    const time = date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return sameDay ? time : `ontem · ${time}`;
  }

  if (diffH < 48) {
    const time = date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `ontem · ${time}`;
  }

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Formata apenas a APRESENTAÇÃO do telefone (nunca altera o valor armazenado).
 * Aceita E.164 (+5511987654321) ou formato local (11987654321) → exibe com
 * espaçamento BR. Se não parecer um número BR válido, devolve o valor original.
 */
export function formatDisplayPhone(input: string | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  const digits = raw.replace(/\D/g, "");

  let national = "";
  if (
    digits.startsWith("55") &&
    (digits.length === 13 || digits.length === 12)
  ) {
    national = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("9")) {
    national = digits;
  } else if (digits.length === 11 || digits.length === 10) {
    national = digits;
  } else {
    return raw;
  }

  const ddd = national.slice(0, 2);
  const num = national.slice(2);
  const group = num.length === 9 ? num.slice(0, 5) : num.slice(0, 4);
  const rest = num.length === 9 ? num.slice(5) : num.slice(4);
  if (!rest) return raw;
  return `+55 ${ddd} ${group}-${rest}`;
}

function usePriorityTone(score: number | null | undefined) {
  return useMemo(() => {
    if (score == null) return null;
    if (score >= 70)
      return { tone: "emerald" as const, label: "Alta intenção" };
    if (score >= 40) return { tone: "amber" as const, label: "Média intenção" };
    return { tone: "zinc" as const, label: "Baixa intenção" };
  }, [score]);
}

export function InboxCard({
  conversation: c,
  onOpen,
  onDelete,
  highlighted = false,
  unread = false,
}: InboxCardProps) {
  const initials = (c.lead_name?.[0] ?? "?").toUpperCase();
  const style = useMemo(() => statusStyle(c.lead_status), [c.lead_status]);
  const priority = usePriorityTone(c.lead_score);
  const [menuOpen, setMenuOpen] = useState(false);
  const phone = useMemo(() => formatDisplayPhone(c.lead_phone), [c.lead_phone]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Abrir conversa com ${c.lead_name ?? "contato"}`}
      className={`inbox-card group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#E6E8F0] bg-white p-4 text-left shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#C7D2FE] hover:shadow-[0_8px_24px_rgba(99,102,241,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/60 active:scale-[0.99] ${
        highlighted ? "inbox-card-flash" : ""
      }`}
    >
      {/* Menu de ações (⋮) */}
      {onDelete ? (
        <div
          className="absolute right-2 top-2 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={`Ações da conversa com ${c.lead_name ?? "contato"}`}
            aria-expanded={menuOpen}
            title="Mais ações"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100/70 text-[#64748B] transition-colors hover:bg-slate-200/80 hover:text-[#0F172A] focus:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-[#E6E8F0] bg-white shadow-xl">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[#EF4444] transition-colors hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir conversa
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Cabeçalho: avatar + nome + indicador IA/humano */}
      <div className="flex items-start gap-2.5 pr-8">
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] text-sm font-bold text-white shadow-xs transition-transform group-hover:scale-105">
            {initials}
          </div>
          {unread && (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#6366F1] ring-2 ring-white"
              aria-label="Não lida"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-start gap-1.5">
            <span
              title={c.lead_name ?? "Contato"}
              className="min-w-0 flex-1 break-words font-bold leading-snug text-[#0F172A] line-clamp-2"
            >
              {c.lead_name ?? "Contato"}
            </span>
            {c.human_handled ? (
              <span
                className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700"
                title="Modo manual"
              >
                <User className="h-2.5 w-2.5" /> humano
              </span>
            ) : (
              <span
                className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
                title="Atendimento de IA"
              >
                <Bot className="h-2.5 w-2.5" /> IA
              </span>
            )}
          </div>
          <Badge tone={style.tone} className="w-fit px-2 py-0.5 text-[10px]">
            {style.label}
          </Badge>
        </div>
      </div>

      {/* Telefone do contato */}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-[#475569]">
        <Phone className="h-3.5 w-3.5 shrink-0 text-[#10B981]" />
        <span className="truncate font-medium tracking-wide">
          {phone ?? "Número não informado"}
        </span>
      </div>

      {/* Contexto comercial: prioridade/intenção + segmento */}
      <div className="mt-2.5 flex min-w-0 items-center gap-2">
        {priority ? (
          <Badge
            tone={priority.tone}
            className="shrink-0 px-1.5 py-0.5 text-[10px]"
          >
            <Flame className="mr-1 inline h-2.5 w-2.5" />
            {priority.label}
          </Badge>
        ) : null}
        <span className="truncate text-[11px] text-[#64748B]">
          {c.lead_segment || c.business_name || ""}
        </span>
      </div>

      {/* Rodapé: horário + mensagens não lidas */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-[#F1F5F9]">
        <span className="text-[11px] text-[#94A3B8]">
          {formatRelativeTime(c.last_message_at)}
        </span>
        {unread ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold text-[#6366F1]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[#6366F1]"
              aria-hidden="true"
            />
            nova
          </span>
        ) : (
          <span className="w-4" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

