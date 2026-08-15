'use client';

/** Skeleton shimmer exibido enquanto o inbox carrega (cards quadrados). */
export function InboxSkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="status" aria-label="Carregando conversas">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex aspect-square flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="inbox-shimmer h-12 w-12 shrink-0 rounded-full" />
            <div className="inbox-shimmer h-5 w-20 rounded-full" />
          </div>
          <div className="space-y-2">
            <div className="inbox-shimmer h-3.5 w-3/4 rounded-md" />
            <div className="inbox-shimmer h-3 w-1/2 rounded-md" />
          </div>
          <div className="flex-1" />
          <div className="space-y-1.5">
            <div className="inbox-shimmer h-3 w-full rounded-md" />
            <div className="inbox-shimmer h-3 w-2/3 rounded-md" />
          </div>
          <div className="flex justify-end">
            <div className="inbox-shimmer h-2.5 w-14 rounded-md" />
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}