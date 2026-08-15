"use client";

const STATUS_STYLES: Record<string, string> = {
  // Empresa
  PENDING_PAYMENT: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  TRIAL: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  ACTIVE: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  PAST_DUE: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  SUSPENDED: "bg-red-500/15 text-red-600 border-red-500/30",
  CANCELLED: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  // Assinatura
  TRIALING: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  EXPIRED: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  // Pagamento
  PENDING: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  CONFIRMED: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  RECEIVED: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  OVERDUE: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  REFUNDED: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  // Usuário
  PLATFORM_ADMIN: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  PLATFORM_STAFF: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  NONE: "bg-zinc-600/15 text-zinc-500 border-zinc-300",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200"}`}
    >
      {label ?? status}
    </span>
  );
}
