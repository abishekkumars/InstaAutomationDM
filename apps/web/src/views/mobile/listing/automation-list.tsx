'use client';

import { useMemo, useState, useTransition } from 'react';
import type { AutomationListItem } from '@/app/dashboard-data';
import { setAutomationActiveAction, syncAutomationsAction } from '@/app/automation-actions';
import { DataAge } from '@/views/shared/freshness';
import { FormPendingOverlay, LoadingLink } from '@/views/shared/loader';
import { ClickIcon, ImageIcon, RefreshIcon, SearchIcon, SendIcon } from '../icons';
import { MobilePageHeader } from '../page-header';
import { MobileSwitch } from '../switch';

type Filter = 'all' | 'active' | 'paused';

const numberFormat = new Intl.NumberFormat('en-US');

/** The listing's interactive part: header, search, filters and the cards.
 *
 * One client component owns the search text because two inputs show it - the full-width bar
 * under the title, and the one that opens from the search icon once the header has collapsed
 * (the design review's "search bar needs to freeze... show on the small icon").
 *
 * The enable switch is optimistic: it flips at once and rolls back with a message if the server
 * action reports failure. `overrides` holds only the flips made on this page; once the action's
 * revalidation re-renders the server data, the prop and the override agree. */
export function MobileAutomationList({
  organizationId,
  automations,
  accountLabel,
  ageSeconds,
}: {
  organizationId: string;
  automations: AutomationListItem[];
  accountLabel: string;
  ageSeconds: number;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const rows = useMemo(
    () =>
      automations.map((automation) => ({
        ...automation,
        isActive: overrides[automation.id] ?? automation.isActive,
      })),
    [automations, overrides],
  );
  const activeCount = rows.filter((row) => row.isActive).length;
  const pausedCount = rows.length - activeCount;

  const needle = query.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (filter === 'active' && !row.isActive) return false;
    if (filter === 'paused' && row.isActive) return false;
    if (!needle) return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      row.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
    );
  });

  function toggle(automation: AutomationListItem & { isActive: boolean }) {
    const next = !automation.isActive;
    setToggleError(null);
    setOverrides((current) => ({ ...current, [automation.id]: next }));
    setPendingIds((current) => new Set(current).add(automation.id));
    startTransition(async () => {
      // A request that never completes (offline, server restarting) rejects rather than returning
      // `{ ok: false }` - treated the same, or the switch would stay flipped with no message.
      const result = await setAutomationActiveAction(automation.id, next).catch(() => ({
        ok: false,
      }));
      if (!result.ok) {
        setOverrides((current) => ({ ...current, [automation.id]: !next }));
        setToggleError(
          `Could not ${next ? 'enable' : 'pause'} "${automation.name}". Check your connection and try again.`,
        );
      }
      setPendingIds((current) => {
        const copy = new Set(current);
        copy.delete(automation.id);
        return copy;
      });
    });
  }

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'paused', label: 'Paused', count: pausedCount },
  ];

  const searchInput = (autoFocus: boolean, height: string) => (
    <label
      className={`flex ${height} items-center gap-2.5 rounded-2xl border border-border bg-surface px-3.5 text-text-muted`}
    >
      <SearchIcon size={18} />
      <input
        type="search"
        aria-label="Search automations"
        placeholder="Search by name or keyword"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus={autoFocus}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text-faint"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <MobilePageHeader
        eyebrow={accountLabel}
        title="Automations"
        compactSubtitle={`${activeCount} active · ${pausedCount} paused`}
        trailing={
          <form action={syncAutomationsAction}>
            <FormPendingOverlay />
            <input type="hidden" name="organizationId" value={organizationId} />
            <button
              type="submit"
              aria-label="Sync now"
              className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-surface text-text"
            >
              <RefreshIcon size={20} />
            </button>
          </form>
        }
        compactTrailing={
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            aria-label="Search automations"
            aria-pressed={searchOpen}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border transition-colors ${
              searchOpen
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface text-text'
            }`}
          >
            <SearchIcon size={20} />
          </button>
        }
        compactBelow={searchOpen ? searchInput(true, 'h-11') : undefined}
        keepCompact={searchOpen}
      >
        <div className="flex items-center gap-2 text-[13px] text-text-muted">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span>
            {activeCount} active · {pausedCount} paused ·{' '}
            <DataAge initialAgeSeconds={ageSeconds} className="lowercase" />
          </span>
        </div>
        {searchInput(false, 'h-12')}
        <div className="flex gap-2" role="group" aria-label="Filter automations">
          {filters.map((item) => {
            const selected = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                aria-pressed={selected}
                className={`flex h-[38px] items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-bold ${
                  selected
                    ? 'border-text bg-text text-canvas'
                    : 'border-border bg-surface text-text'
                }`}
              >
                {item.label}
                <span className={`font-semibold ${selected ? 'text-canvas' : 'text-text-muted'}`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </MobilePageHeader>

      {toggleError && (
        <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
          {toggleError}
        </p>
      )}

      <ul className="flex flex-col gap-2.5">
        {visible.map((automation) => (
          <li
            key={automation.id}
            className="flex items-center gap-2.5 rounded-[22px] border border-border bg-surface p-3 shadow-card"
          >
            <LoadingLink
              href={`/instagram/posts/${automation.platformPostId}?accountId=${automation.instagramAccountId}`}
              aria-label={`Open post for ${automation.name}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Thumbnail url={automation.post?.thumbnailUrl ?? null} />
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="truncate text-[15px] font-bold text-text">{automation.name}</span>
                <span className="truncate text-[12.5px] text-text-muted">
                  {triggerText(automation.keywords)}
                </span>
                <span className="mt-[3px] flex items-center gap-2.5 text-xs font-semibold text-text-muted">
                  <span
                    className={`rounded-full px-2 py-0.5 font-bold ${
                      automation.isActive ? 'bg-success-bg text-success' : 'bg-warn-bg text-warn'
                    }`}
                  >
                    {automation.isActive ? 'Active' : 'Paused'}
                  </span>
                  <span className="inline-flex items-center gap-1" title="DMs sent">
                    <SendIcon size={13} strokeWidth={2.2} />
                    <span className="sr-only">DMs sent:</span>
                    {automation.stats ? numberFormat.format(automation.stats.dmsSent) : '—'}
                  </span>
                  <span className="inline-flex items-center gap-1" title="Button clicks">
                    <ClickIcon size={13} strokeWidth={2.2} />
                    <span className="sr-only">Button clicks:</span>
                    {automation.stats && automation.buttons.length > 0
                      ? numberFormat.format(automation.stats.linkClicks)
                      : '—'}
                  </span>
                </span>
              </span>
            </LoadingLink>
            <MobileSwitch
              checked={automation.isActive}
              onChange={() => toggle(automation)}
              disabled={pendingIds.has(automation.id)}
              label={`Enabled: ${automation.name}`}
            />
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="rounded-[22px] border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
          {rows.length === 0
            ? 'No automations yet. Tap + to pick a post and create one.'
            : 'No automations match your search.'}
        </p>
      )}
    </div>
  );
}

function triggerText(keywords: string[]): string {
  // An empty list means "any comment" (Phase 16.2, requirement 12), not "no trigger".
  if (keywords.length === 0) return 'Every comment triggers';
  return `Comment contains ${keywords.map((keyword) => `“${keyword}”`).join(', ')}`;
}

function Thumbnail({ url }: { url: string | null }) {
  if (url) {
    // Plain <img>, not next/image: Instagram's CDN is an arbitrary remote host this app does not
    // configure for optimization - same reason as the desktop views.
    return (
      <img
        src={url}
        alt=""
        className="h-[58px] w-[58px] shrink-0 rounded-2xl bg-seg object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl bg-seg text-tile-icon">
      <ImageIcon />
    </span>
  );
}
