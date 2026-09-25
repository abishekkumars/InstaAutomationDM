'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Height of the pinned compact header, in px: the large header counts as scrolled away once its
 * bottom edge passes underneath it. */
const COMPACT_HEADER_HEIGHT = 68;

/** The large page title that collapses into a small pinned glass header on scroll, on every
 * mobile page (approved in the design review: "the page title needs to show smaller while
 * scrolling").
 *
 * `children` sits under the title inside the large header - the listing puts its search bar and
 * filters there, so the compact header appears only once those have scrolled away too, and can
 * offer a search icon in their place (`compactTrailing` / `compactBelow`).
 *
 * Collapse is detected with an IntersectionObserver on a sentinel after the large header, not a
 * scroll listener: no work on every scroll frame, and it does not need to know which element
 * scrolls. With the default viewport root, the observer still accounts for the shell's own
 * scroll container clipping the sentinel. */
export function MobilePageHeader({
  title,
  eyebrow,
  compactTitle,
  compactSubtitle,
  compactLeading,
  trailing,
  compactTrailing,
  compactBelow,
  keepCompact = false,
  children,
}: {
  title: string;
  eyebrow?: ReactNode;
  /** Defaults to `title`. */
  compactTitle?: string;
  compactSubtitle?: ReactNode;
  /** Left of the compact title (e.g. a back button on a detail page). */
  compactLeading?: ReactNode;
  /** Right side of the large header (e.g. a sync button or a range switch). */
  trailing?: ReactNode;
  /** Right side of the compact header. */
  compactTrailing?: ReactNode;
  /** A row under the compact header's title (e.g. the expanded search field). */
  compactBelow?: ReactNode;
  /** Hold the compact header open regardless of scroll position - e.g. while its search field is
   * in use. Without it, filtering can shorten the page until the large header scrolls back into
   * view, which hid the compact header, made it `inert`, and dropped focus from the field
   * mid-typing. */
  keepCompact?: boolean;
  children?: ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // Out of view *above* the compact header means scrolled past. Out of view below (a very
        // short viewport) is not a reason to collapse.
        setCollapsed(!entry.isIntersecting && entry.boundingClientRect.top < COMPACT_HEADER_HEIGHT);
      },
      { rootMargin: `-${COMPACT_HEADER_HEIGHT}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const showCompact = collapsed || keepCompact;

  return (
    <>
      <header className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {eyebrow && <p className="text-[13px] font-semibold text-text-muted">{eyebrow}</p>}
            <h1 className="text-[30px] leading-[38px] font-extrabold tracking-[-0.02em] text-text">
              {title}
            </h1>
          </div>
          {trailing}
        </div>
        {children}
      </header>
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      {/* `inert` while hidden so its controls are neither focusable nor announced; the large
          header above is the real one for assistive technology, so the compact title is
          aria-hidden and only the controls in it are exposed. */}
      <div
        inert={!showCompact}
        className={`fixed inset-x-0 top-0 z-30 flex flex-col gap-2.5 border-b border-glass-border bg-glass px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 shadow-header backdrop-blur-2xl backdrop-saturate-[1.8] transition duration-200 ${
          showCompact
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-full opacity-0'
        }`}
      >
        <div className="flex min-h-11 items-center justify-between gap-3">
          {compactLeading}
          <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-lg font-extrabold tracking-[-0.01em] text-text">
              {compactTitle ?? title}
            </span>
            {compactSubtitle && (
              <span className="truncate text-xs font-semibold text-text-muted">
                {compactSubtitle}
              </span>
            )}
          </div>
          {compactTrailing}
        </div>
        {compactBelow}
      </div>
    </>
  );
}
