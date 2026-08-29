"use client";

/** Skeleton shimmer exibido enquanto o inbox carrega (cards compactos). */
export function InboxSkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-label="Carregando conversas"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-2xl border border-[#E6E8F0] bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]"
        >
          <div className="flex items-start gap-2.5">
            <div className="inbox-shimmer h-10 w-10 shrink-0 rounded-2xl" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <div className="inbox-shimmer h-3.5 w-3/4 rounded-md" />
              <div className="inbox-shimmer h-4 w-20 rounded-full" />
            </div>
          </div>
          <div className="inbox-shimmer h-3 w-2/3 rounded-md" />
          <div className="inbox-shimmer h-3 w-1/2 rounded-md" />
          <div className="flex-1" />
          <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9]">
            <div className="inbox-shimmer h-2.5 w-14 rounded-md" />
            <div className="inbox-shimmer h-2.5 w-8 rounded-md" />
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

