export function Progress({
  value,
  max = 100,
  tone = 'gradient',
  className = '',
}: {
  value: number;
  max?: number;
  tone?: 'emerald' | 'red' | 'whatsapp' | 'brand' | 'gradient';
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fillColor =
    tone === 'gradient'
      ? 'bg-gradient-to-r from-[#6366F1] via-[#A855F7] to-[#EC4899]'
      : tone === 'brand'
      ? 'bg-[#6366F1]'
      : tone === 'whatsapp'
      ? 'bg-[#10B981]'
      : tone === 'red'
      ? 'bg-[#EF4444]'
      : pct >= 100
      ? 'bg-[#EF4444]'
      : 'bg-[#10B981]';

  return (
    <div className={`h-2.5 w-full rounded-full bg-slate-100 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full ${fillColor} transition-all duration-500 ease-out`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

