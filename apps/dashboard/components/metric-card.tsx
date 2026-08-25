'use client';

import { LucideIcon } from 'lucide-react';

export type MetricTone = 'blue' | 'amber' | 'emerald' | 'purple' | 'cyan' | 'red' | 'brand' | 'zinc' | 'whatsapp';

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: MetricTone;
  badge?: string;
  hint?: string;
  className?: string;
}

const TONE_STYLES: Record<MetricTone, { iconBg: string; iconColor: string; badgeBg: string; badgeText: string; badgeBorder: string; cardBorder?: string }> = {
  blue: {
    iconBg: 'bg-[#EFF6FF]',
    iconColor: 'text-[#3B82F6]',
    badgeBg: 'bg-[#EFF6FF]',
    badgeText: 'text-[#3B82F6]',
    badgeBorder: 'border-[#DBEAFE]',
  },
  amber: {
    iconBg: 'bg-[#FFFBEB]',
    iconColor: 'text-[#F59E0B]',
    badgeBg: 'bg-[#FFFBEB]',
    badgeText: 'text-[#F59E0B]',
    badgeBorder: 'border-[#FEF3C7]',
  },
  emerald: {
    iconBg: 'bg-[#ECFDF5]',
    iconColor: 'text-[#10B981]',
    badgeBg: 'bg-[#ECFDF5]',
    badgeText: 'text-[#10B981]',
    badgeBorder: 'border-[#D1FAE5]',
  },
  purple: {
    iconBg: 'bg-[#F5F3FF]',
    iconColor: 'text-[#8B5CF6]',
    badgeBg: 'bg-[#F5F3FF]',
    badgeText: 'text-[#8B5CF6]',
    badgeBorder: 'border-[#EDE9FE]',
  },
  cyan: {
    iconBg: 'bg-[#ECFEFF]',
    iconColor: 'text-[#06B6D4]',
    badgeBg: 'bg-[#ECFEFF]',
    badgeText: 'text-[#06B6D4]',
    badgeBorder: 'border-[#CFFAFE]',
  },
  red: {
    iconBg: 'bg-[#FEF2F2]',
    iconColor: 'text-[#EF4444]',
    badgeBg: 'bg-[#FEF2F2]',
    badgeText: 'text-[#EF4444]',
    badgeBorder: 'border-[#FEE2E2]',
  },
  brand: {
    iconBg: 'bg-[#EEF2FF]',
    iconColor: 'text-[#6366F1]',
    badgeBg: 'bg-[#EEF2FF]',
    badgeText: 'text-[#6366F1]',
    badgeBorder: 'border-[#E0E7FF]',
  },
  whatsapp: {
    iconBg: 'bg-[#ECFDF5]',
    iconColor: 'text-[#10B981]',
    badgeBg: 'bg-[#ECFDF5]',
    badgeText: 'text-[#10B981]',
    badgeBorder: 'border-[#D1FAE5]',
  },
  zinc: {
    iconBg: 'bg-[#F8FAFC]',
    iconColor: 'text-[#64748B]',
    badgeBg: 'bg-[#F1F5F9]',
    badgeText: 'text-[#64748B]',
    badgeBorder: 'border-[#E2E8F0]',
  },
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'brand',
  badge,
  hint,
  className = '',
}: MetricCardProps) {
  const style = TONE_STYLES[tone] ?? TONE_STYLES.brand;

  return (
    <div
      className={`relative flex flex-col justify-between rounded-2xl border border-[#E6E8F0] bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] ${className}`}
    >
      {/* Top row: Icon badge */}
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${style.iconBg} ${style.iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {/* Label */}
      <div className="mt-3">
        <span className="text-xs font-medium text-[#64748B]">{label}</span>
      </div>

      {/* Value + Trend Badge */}
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">
          {value}
        </div>
        {badge ? (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}
          >
            {badge}
          </span>
        ) : null}
      </div>

      {/* Bottom hint / description */}
      {hint ? (
        <div className="mt-2 text-[11px] text-[#94A3B8] truncate">{hint}</div>
      ) : null}
    </div>
  );
}

