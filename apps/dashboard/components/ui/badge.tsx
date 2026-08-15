import * as React from 'react';

type BadgeTone =
  | 'zinc'
  | 'emerald'
  | 'amber'
  | 'blue'
  | 'red'
  | 'sky'
  | 'violet'
  | 'whatsapp'
  | 'brand';

const TONE_CLASSES: Record<BadgeTone, string> = {
  zinc: 'bg-zinc-500/15 text-zinc-500',
  emerald: 'bg-emerald-500/15 text-emerald-600',
  amber: 'bg-amber-500/15 text-amber-600',
  blue: 'bg-blue-500/15 text-blue-600',
  sky: 'bg-sky-500/15 text-sky-600',
  red: 'bg-red-500/15 text-red-600',
  violet: 'bg-violet-500/15 text-violet-600',
  whatsapp: 'bg-emerald-500/20 text-emerald-600',
  brand: 'bg-emerald-500/20 text-emerald-600',
};

export function Badge({ tone = 'zinc', children, className = '' }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${TONE_CLASSES[tone]} ${className}`}>
      {children}
    </span>
  );
}

const LEAD_STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: 'amber',
  PROCESSING: 'blue',
  SENT: 'emerald',
  RESPONDED: 'sky',
  AGENT_ACTIVE: 'violet',
  INTERESTED: 'brand',
  NOT_INTERESTED: 'red',
  OPT_OUT: 'zinc',
  ERROR: 'red',
};

const LEAD_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  SENT: 'Enviado',
  RESPONDED: 'Respondeu',
  AGENT_ACTIVE: 'Em atendimento',
  INTERESTED: 'Interessado',
  NOT_INTERESTED: 'Não interessado',
  OPT_OUT: 'Opt-out',
  ERROR: 'Erro',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={LEAD_STATUS_TONE[status] ?? 'zinc'}>{LEAD_STATUS_LABEL[status] ?? status}</Badge>;
}
