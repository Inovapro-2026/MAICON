export function Progress({ value, max = 100, tone = 'emerald', className = '' }: { value: number; max?: number; tone?: 'emerald' | 'red' | 'whatsapp'; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fillColor =
    tone === 'whatsapp' ? 'bg-[#25D366]' : tone === 'red' ? 'bg-red-500' : pct >= 100 ? 'bg-red-500' : 'bg-emerald-500';
  return (
    <div className={`h-2 w-full rounded-full bg-zinc-100 ${className}`}>
      <div className={`h-full rounded-full ${fillColor} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}
