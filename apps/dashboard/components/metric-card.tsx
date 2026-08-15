'use client';

import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'brand',
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: 'brand' | 'red' | 'amber' | 'blue' | 'whatsapp' | 'zinc';
  hint?: string;
}) {
  const iconColor: Record<string, string> = {
    brand: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    whatsapp: 'text-[#25D366]',
    zinc: 'text-zinc-500',
  };
  const valueColor = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-emerald-600';

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <Icon className={`h-5 w-5 ${iconColor[tone]}`} />
      </div>
      <div className={`font-display text-[28px] font-bold leading-none ${valueColor}`}>{value}</div>
      {hint ? <div className="text-[11px] text-zinc-500">{hint}</div> : null}
    </Card>
  );
}
