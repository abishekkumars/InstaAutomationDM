/** Loading placeholders.
 *
 * These mirror the real components' box model (same padding, radius, border, and row heights) so
 * content does not jump when it swaps in. `animate-pulse` is Tailwind's built-in and respects
 * prefers-reduced-motion via the framework's own media query handling.
 *
 * aria-hidden throughout: the surrounding Suspense boundary is what a screen reader should
 * announce, not a grid of empty grey boxes.
 */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-muted-bg ${className}`} />;
}

export function StatCardsSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <Bar className="h-2.5 w-20" />
          <Bar className="mt-2.5 h-6 w-14" />
          <Bar className="mt-2 h-2 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ rows = 2, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div
      className="animate-pulse rounded-xl border border-border bg-surface p-4 shadow-sm"
      aria-hidden
    >
      {title && <Bar className="h-3 w-28" />}
      <div className="mt-3 space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <Bar key={i} className="h-3 w-full max-w-sm" />
        ))}
      </div>
    </div>
  );
}

/** Matches AutomationsBrowser: a toolbar row above a bordered table shell. */
export function AutomationsTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="flex flex-wrap items-center gap-2">
        <Bar className="h-9 min-w-[200px] flex-1" />
        <Bar className="h-9 w-40" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-surface-2 px-4 py-3">
          <Bar className="h-2.5 w-24" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border p-4 last:border-0">
            <Bar className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-3 w-40" />
              <Bar className="h-2.5 w-28" />
            </div>
            <Bar className="h-3 w-10 shrink-0" />
            <Bar className="h-3 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches the posts grid/list. */
export function PostsGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
        >
          <Bar className="h-[150px] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Bar className="h-3 w-full" />
            <Bar className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
