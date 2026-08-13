'use client';

/** Numbered pagination with first/last jumps and an ellipsis window, so any page is reachable
 * directly rather than only one step at a time.
 *
 * Extracted from the posts browser so the dashboard's automations table uses the same control
 * rather than a second implementation that could drift from it.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
      <PageButton disabled={page === 1} onClick={() => onPageChange(page - 1)} label="Previous">
        ←
      </PageButton>
      {buildPageList(page, totalPages).map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-text-faint">
            …
          </span>
        ) : (
          <PageButton
            key={entry}
            active={entry === page}
            onClick={() => onPageChange(entry)}
            label={`Page ${entry}`}
          >
            {entry}
          </PageButton>
        ),
      )}
      <PageButton
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        label="Next"
      >
        →
      </PageButton>
    </nav>
  );
}

/** First page, last page, and a window around the current one, with 'gap' markers where pages
 * are skipped. Keeps the control a fixed width regardless of how many pages exist. */
export function buildPageList(page: number, totalPages: number): (number | 'gap')[] {
  const pages = new Set<number>([1, totalPages, page]);
  for (let offset = 1; offset <= 2; offset += 1) {
    if (page - offset > 1) pages.add(page - offset);
    if (page + offset < totalPages) pages.add(page + offset);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) {
      result.push('gap');
    }
    result.push(value);
    previous = value;
  }
  return result;
}

function PageButton({
  children,
  onClick,
  active,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'min-w-[32px] rounded-md bg-accent px-2 py-1 text-sm font-medium text-accent-ink'
          : 'min-w-[32px] rounded-md border border-border px-2 py-1 text-sm text-text-muted hover:bg-muted-bg hover:text-text disabled:opacity-40 disabled:hover:bg-transparent'
      }
    >
      {children}
    </button>
  );
}
