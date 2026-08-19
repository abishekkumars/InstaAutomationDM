'use client';

import { LoadingLink } from '../../loader';
import { BoltIcon } from '@/app/icons';
import { Pagination } from '@/app/pagination';
import { formatDate } from '@/lib/format-date';
import { useUrlNumberState, useUrlState } from '@/app/use-url-state';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface InstagramPostSummary {
  /** Instagram's own media id - the pivot since Phase 17, and what the post route keys on. */
  platformPostId: string;
  permalink: string | null;
  caption: string;
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

type ViewMode = 'grid' | 'list';
type SortOrder = 'newest' | 'oldest';
type AutomationFilter = 'all' | 'automated' | 'none';

// Type guards for useUrlState: these values arrive from a user-editable query string, so an
// unrecognised one must fall back to the default rather than be cast blindly.
function isViewMode(value: string): value is ViewMode {
  return value === 'grid' || value === 'list';
}
function isSortOrder(value: string): value is SortOrder {
  return value === 'newest' || value === 'oldest';
}
function isAutomationFilter(value: string): value is AutomationFilter {
  return value === 'all' || value === 'automated' || value === 'none';
}

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;

// Row geometry for the virtualizer. These are fixed heights rather than measured ones: every
// row in a given view mode renders at the same size (a square thumbnail in grid, a fixed-height
// strip in list), so measuring each one would cost layout work for no benefit.
const LIST_ROW_HEIGHT = 88;
const GRID_ROW_HEIGHT = 248;
// Thumbnail height inside a grid card. The remainder of GRID_ROW_HEIGHT (minus ROW_GAP) is
// what's left for the caption block, so these two numbers must be chosen together - see the
// comment in PostCard for why this is a fixed height rather than an aspect ratio.
const GRID_THUMB_HEIGHT = 150;
// Gap between rows, included in the row heights above so the rendered grid and the spacer
// math agree exactly - a mismatch here makes content drift against the scrollbar while
// scrolling, which looks like the list jumping back on itself.
const ROW_GAP = 12;
const OVERSCAN = 4;

export function PostsBrowser({
  posts,
  accountId,
  automationsByPostId,
}: {
  posts: InstagramPostSummary[];
  accountId: string;
  /** platformPostId -> is that post's automation enabled. A missing key means the post has no
   * automation at all, which is why this is a lookup rather than a boolean on each post: the
   * automations come from a separate call that is allowed to fail without failing the page. */
  automationsByPostId: Record<string, boolean>;
}) {
  // View mode, sort, page size and page live in the URL, not component state: opening a post
  // unmounts this component, and plain useState meant Back always landed on grid/newest/page 1
  // regardless of what the user had chosen. `search` stays local on purpose - a half-typed
  // query is not view state worth restoring, and putting it in the URL would rewrite history on
  // every keystroke.
  const [view, setView] = useUrlState<ViewMode>('view', 'grid', isViewMode);
  const [sort, setSort] = useUrlState<SortOrder>('sort', 'newest', isSortOrder);
  const [pageSize, setPageSize] = useUrlNumberState('size', 24, PAGE_SIZE_OPTIONS);
  const [page, setPage] = useUrlNumberState('page', 1);
  // Deliberately NOT named `automation`: ToastHost (app/toast.tsx) reads `?automation=` globally
  // as a create/update/delete status and would render a stray error toast for a filter value.
  const [automationFilter, setAutomationFilter] = useUrlState<AutomationFilter>(
    'automated',
    'all',
    isAutomationFilter,
  );
  const [search, setSearch] = useState('');

  // Search across every synced post, not just the visible page - that is the whole reason the
  // page fetches the account's full window up front instead of one server page at a time.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? posts.filter(
          (post) =>
            post.caption.toLowerCase().includes(query) ||
            (post.mediaType ?? '').toLowerCase().includes(query),
        )
      : posts;

    const matched =
      automationFilter === 'all'
        ? searched
        : searched.filter((post) => {
            const hasAutomation = post.platformPostId in automationsByPostId;
            return automationFilter === 'automated' ? hasAutomation : !hasAutomation;
          });

    // Copy before sorting: Array.prototype.sort mutates, and `posts` is props.
    return [...matched].sort((a, b) => {
      // Posts with no publishedAt sort last in both directions rather than jumping to the top
      // as epoch 0 would make them.
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : null;
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : null;
      if (aTime === null && bTime === null) return 0;
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return sort === 'newest' ? bTime - aTime : aTime - bTime;
    });
  }, [posts, search, sort, automationFilter, automationsByPostId]);

  // Forwarded onto each post link so the detail page's "Back to posts" can rebuild this exact
  // view. Only non-default values are included, keeping the common URL clean.
  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (view !== 'grid') params.set('view', view);
    if (sort !== 'newest') params.set('sort', sort);
    if (pageSize !== 24) params.set('size', String(pageSize));
    if (page !== 1) params.set('page', String(page));
    if (automationFilter !== 'all') params.set('automated', automationFilter);
    const query = params.toString();
    return query ? `&${query}` : '';
  }, [view, sort, pageSize, page, automationFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp rather than storing a corrected page: if a search shrinks the result set below the
  // current page, this renders the last valid page without an extra render pass.
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  // Any change to the result set or page size should return to page 1 - staying on page 7 of a
  // search that now has two results is never what the user meant.
  //
  // Compares against the previous values rather than using an effect. setPage is recreated on
  // every searchParams change (it closes over them to keep sibling params), so an effect
  // depending on it would re-run on every URL write and clobber the page the user just picked -
  // and omitting it from the deps is exactly the stale-closure bug the lint rule warns about.
  // A render-time comparison sidesteps both: it fires only when one of these three actually
  // changes, and never on mount, so a page restored from the URL survives.
  const previousInputs = useRef({ search, sort, pageSize, automationFilter });
  if (
    previousInputs.current.search !== search ||
    previousInputs.current.sort !== sort ||
    previousInputs.current.pageSize !== pageSize ||
    previousInputs.current.automationFilter !== automationFilter
  ) {
    previousInputs.current = { search, sort, pageSize, automationFilter };
    if (page !== 1) {
      setPage(1);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Toolbar
        view={view}
        onViewChange={setView}
        sort={sort}
        onSortChange={setSort}
        search={search}
        onSearchChange={setSearch}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        automationFilter={automationFilter}
        onAutomationFilterChange={setAutomationFilter}
        resultCount={filtered.length}
        totalCount={posts.length}
      />

      {pageItems.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted shadow-sm">
          {posts.length === 0
            ? 'No posts found for this account yet.'
            : search.trim()
              ? `No posts match "${search}".`
              : automationFilter === 'automated'
                ? 'None of this account’s posts have an automation yet.'
                : automationFilter === 'none'
                  ? 'Every post on this account already has an automation.'
                  : 'No posts match the current filters.'}
        </div>
      ) : (
        <VirtualPostList
          listQuery={listQuery}
          items={pageItems}
          view={view}
          accountId={accountId}
          automationsByPostId={automationsByPostId}
          resetKey={`${currentPage}|${pageSize}|${sort}|${search}|${automationFilter}`}
        />
      )}

      <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

function Toolbar({
  view,
  onViewChange,
  sort,
  onSortChange,
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  automationFilter,
  onAutomationFilterChange,
  resultCount,
  totalCount,
}: {
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
  sort: SortOrder;
  onSortChange: (value: SortOrder) => void;
  search: string;
  onSearchChange: (value: string) => void;
  pageSize: number;
  onPageSizeChange: (value: number) => void;
  automationFilter: AutomationFilter;
  onAutomationFilterChange: (value: AutomationFilter) => void;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search captions..."
          aria-label="Search posts"
          className="w-full rounded-lg border border-border-strong bg-surface py-1.5 pl-8 pr-3 text-sm text-text placeholder:text-text-faint"
        />
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-text-faint">
          ⌕
        </span>
      </div>

      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortOrder)}
        aria-label="Sort posts"
        className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>

      <select
        value={automationFilter}
        onChange={(event) => onAutomationFilterChange(event.target.value as AutomationFilter)}
        aria-label="Filter by automation"
        className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
      >
        <option value="all">All posts</option>
        <option value="automated">With automation</option>
        <option value="none">Without automation</option>
      </select>

      <select
        value={pageSize}
        onChange={(event) => onPageSizeChange(Number(event.target.value))}
        aria-label="Posts per page"
        className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size} / page
          </option>
        ))}
      </select>

      <div
        className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
        role="group"
        aria-label="View mode"
      >
        <ViewButton
          active={view === 'grid'}
          onClick={() => onViewChange('grid')}
          label="Card view"
          icon="▦"
        />
        <ViewButton
          active={view === 'list'}
          onClick={() => onViewChange('list')}
          label="List view"
          icon="☰"
        />
      </div>

      <span className="w-full text-xs text-text-faint sm:w-auto">
        {resultCount === totalCount
          ? `${totalCount} post${totalCount === 1 ? '' : 's'}`
          : `${resultCount} of ${totalCount}`}
      </span>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? 'rounded-md bg-accent px-2.5 py-1 text-sm text-accent-ink'
          : 'rounded-md px-2.5 py-1 text-sm text-text-muted hover:bg-muted-bg hover:text-text'
      }
    >
      {icon}
    </button>
  );
}

/** Windowed renderer: only the rows intersecting the viewport (plus a small overscan) are in
 * the DOM, with spacer divs above and below standing in for the rest so the scrollbar still
 * reflects the full list. Keeps a 96-per-page grid from mounting ~100 image elements at once. */
function VirtualPostList({
  items,
  view,
  accountId,
  listQuery,
  automationsByPostId,
  resetKey,
}: {
  items: InstagramPostSummary[];
  view: ViewMode;
  accountId: string;
  listQuery: string;
  automationsByPostId: Record<string, boolean>;
  /** Changes exactly when the rendered slice genuinely changes (page, page size, sort, or
   * search), so the scroll-reset effect below fires then and only then. */
  resetKey: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [columns, setColumns] = useState(1);

  const rowHeight = view === 'list' ? LIST_ROW_HEIGHT : GRID_ROW_HEIGHT;

  // Column count comes from the measured element width rather than a CSS media query, so the
  // virtualizer's row math always agrees with what the grid actually renders.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    // Each setter is guarded with a same-value check. ResizeObserver fires whenever the box
    // changes, and rendering rows changes content, so an unguarded set here would re-render ->
    // re-observe -> set again, feeding the same scroll-jitter loop from the other direction.
    // React bails out on an identical value, but only if we actually pass the identical value.
    function measure(target: HTMLDivElement) {
      const height = target.clientHeight;
      setViewportHeight((previous) => (previous === height ? previous : height));

      const width = target.clientWidth;
      const next = view === 'list' ? 1 : width >= 1024 ? 4 : width >= 640 ? 3 : 2;
      setColumns((previous) => (previous === next ? previous : next));
    }

    measure(element);
    const observer = new ResizeObserver(() => measure(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);

  // Reset scroll when the page or view changes - otherwise switching to a shorter page leaves
  // the user scrolled past the end, looking at nothing.
  //
  // Keyed on `resetKey` (page number + view), NOT on the `items` array: `items` is a fresh
  // slice() identity on every parent render, so depending on it re-ran this effect mid-scroll
  // and snapped the user back to the top over and over - the "scrolling loops in the same
  // place" bug. Identity is not a meaningful signal here; "which page am I on" is.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [resetKey]);

  const rowCount = Math.ceil(items.length / columns);
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const lastRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN,
  );
  const visible = items.slice(firstRow * columns, lastRow * columns);

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ maxHeight: '65vh' }}
    >
      {/* Spacer above stands in for the rows scrolled past, so the scrollbar length and
          position stay honest even though those rows are not mounted. */}
      <div style={{ height: firstRow * rowHeight }} />
      {/* gridAutoRows pins every row to exactly rowHeight (gap included via the box sizing
          below), so the real layout matches the spacer math above. With natural row heights
          the two disagreed and content visibly drifted against the scrollbar as you moved. */}
      {/* gridAutoRows is rowHeight MINUS the gap, so one row of content plus one gap adds up
          to exactly rowHeight - which is what the spacer math above assumes. */}
      <ul
        style={{
          display: 'grid',
          gridTemplateColumns:
            view === 'list' ? 'minmax(0, 1fr)' : `repeat(${columns}, minmax(0, 1fr))`,
          gridAutoRows: `${rowHeight - ROW_GAP}px`,
          gap: `${ROW_GAP}px`,
        }}
      >
        {visible.map((post) => {
          // `undefined` (key absent) means no automation; true/false means one exists and is
          // enabled/paused. All three states render differently.
          const automationActive = automationsByPostId[post.platformPostId];
          return view === 'list' ? (
            <li key={post.platformPostId} className="min-h-0">
              <PostListRow
                post={post}
                accountId={accountId}
                listQuery={listQuery}
                automationActive={automationActive}
              />
            </li>
          ) : (
            <li key={post.platformPostId} className="min-h-0">
              <PostCard
                post={post}
                accountId={accountId}
                listQuery={listQuery}
                automationActive={automationActive}
              />
            </li>
          );
        })}
      </ul>
      <div style={{ height: Math.max(0, (rowCount - lastRow) * rowHeight) }} />
    </div>
  );
}

// The wrapping <li> lives in VirtualPostList (it carries the fixed row geometry), so these
// render only the card body itself. h-full makes the card fill its pinned row rather than
// collapsing to its natural height inside it.
/** Marks a post that already has a comment automation.
 *
 * Three states, not two: no badge at all when the post has no automation, an accent bolt when it
 * has an enabled one, and a muted bolt when it has one that is paused. Collapsing the last two
 * would make a disabled automation look like it is running.
 */
function AutomationBadge({
  active,
  variant,
}: {
  /** undefined when the post has no automation - the badge then renders nothing. */
  active: boolean | undefined;
  /** 'overlay' floats on a thumbnail (grid cards), 'inline' sits in a text row (list rows). */
  variant: 'overlay' | 'inline';
}) {
  if (active === undefined) {
    return null;
  }

  const label = active ? 'Has an enabled automation' : 'Has a paused automation';
  const tone = active
    ? 'border-success-border bg-success-bg text-success'
    : 'border-border-strong bg-muted-bg text-text-faint';

  if (variant === 'overlay') {
    return (
      <span
        title={label}
        aria-label={label}
        className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm ${tone}`}
      >
        <BoltIcon />
      </span>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      <BoltIcon />
      {active ? 'Automated' : 'Paused'}
    </span>
  );
}

function PostCard({
  post,
  accountId,
  listQuery,
  automationActive,
}: {
  post: InstagramPostSummary;
  accountId: string;
  /** The list's own view/sort/page params, forwarded so "Back to posts" can restore them. */
  listQuery: string;
  automationActive: boolean | undefined;
}) {
  return (
    <LoadingLink
      href={`/instagram/posts/${post.platformPostId}?accountId=${accountId}${listQuery}`}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition hover:border-border-strong"
    >
      {/* relative so the badge can sit over the thumbnail's top-right corner. */}
      <div className="relative shrink-0">
        {/* Fixed height, NOT aspect-square: a square thumbnail scales with column width (~231px
            in a 4-column grid), which ate the whole fixed-height row and clipped the caption out
            of existence. A fixed image height leaves the caption block a guaranteed share of the
            row at every column count. */}
        <Thumbnail
          post={post}
          className="w-full object-cover"
          style={{ height: GRID_THUMB_HEIGHT }}
        />
        <AutomationBadge active={automationActive} variant="overlay" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center px-3 py-2">
        <p className="line-clamp-2 text-sm leading-snug text-text">
          {post.caption || '(no caption)'}
        </p>
        <p className="mt-1 truncate text-xs text-text-faint">
          {post.mediaType ?? 'unknown'}
          {formatDate(post.publishedAt) && ` · ${formatDate(post.publishedAt)}`}
        </p>
      </div>
    </LoadingLink>
  );
}

function PostListRow({
  post,
  accountId,
  listQuery,
  automationActive,
}: {
  post: InstagramPostSummary;
  accountId: string;
  listQuery: string;
  automationActive: boolean | undefined;
}) {
  return (
    <LoadingLink
      href={`/instagram/posts/${post.platformPostId}?accountId=${accountId}${listQuery}`}
      className="flex h-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface p-2 shadow-sm transition hover:border-border-strong"
    >
      <Thumbnail post={post} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{post.caption || '(no caption)'}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-text-faint">
          <span className="truncate">
            {post.mediaType ?? 'unknown'}
            {formatDate(post.publishedAt) && ` · ${formatDate(post.publishedAt)}`}
          </span>
          <AutomationBadge active={automationActive} variant="inline" />
        </div>
      </div>
      <span className="shrink-0 text-text-faint">›</span>
    </LoadingLink>
  );
}

function Thumbnail({
  post,
  className,
  style,
}: {
  post: InstagramPostSummary;
  className: string;
  style?: React.CSSProperties;
}) {
  if (post.thumbnailUrl) {
    // Plain <img>, not next/image: thumbnails come from Zernio/Instagram's own CDN (arbitrary,
    // unconfigured remote hosts), not an asset this app optimizes. No eslint-disable needed -
    // this repo deliberately has no eslint-config-next (see the Phase 2 report), so the
    // @next/next/no-img-element rule does not exist here and referencing it is itself an error.
    return (
      <img src={post.thumbnailUrl} alt="" loading="lazy" className={className} style={style} />
    );
  }
  return (
    <div
      className={`flex items-center justify-center bg-muted-bg text-text-faint ${className}`}
      style={style}
    >
      {post.mediaType === 'video' ? '▶' : '▣'}
    </div>
  );
}

// Pagination, buildPageList and PageButton now live in app/pagination.tsx, shared with the
// dashboard's automations table.
