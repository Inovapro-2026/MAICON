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
  zinc: 'bg-slate-100 text-slate-700 border border-slate-200/80',
  emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  amber: 'bg-amber-50 text-amber-700 border border-amber-200/80',
  blue: 'bg-blue-50 text-blue-700 border border-blue-200/80',
  sky: 'bg-sky-50 text-sky-700 border border-sky-200/80',
  red: 'bg-red-50 text-red-700 border border-red-200/80',
  violet: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',
  whatsapp: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  brand: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',
};

export function Badge({ tone = 'zinc', children, className = '' }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${TONE_CLASSES[tone]} ${className}`}>
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
