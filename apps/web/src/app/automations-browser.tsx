'use client';

import { useMemo, useState } from 'react';
import { LoadingLink } from './loader';

export interface AutomationStats {
  dmsSent: number;
  linkClicks: number;
  clickThroughRate: number | null;
}

export interface AutomationPostPreview {
  caption: string;
  thumbnailUrl: string | null;
  permalink: string | null;
}

export interface AutomationListItem {
  id: string;
  zernioPostId: string;
  instagramAccountId: string;
  accountUsername: string | null;
  name: string;
  keywords: string[];
  matchMode: 'CONTAINS' | 'WORD' | 'EXACT';
  isActive: boolean;
  stats: AutomationStats | null;
  post: AutomationPostPreview | null;
}

const MATCH_MODE_LABEL: Record<AutomationListItem['matchMode'], string> = {
  CONTAINS: 'contains',
  WORD: 'word',
  EXACT: 'exact',
};

type SortKey = 'sent-desc' | 'clicks-desc' | 'name-asc' | 'status-desc';

const SORT_LABEL: Record<SortKey, string> = {
  'sent-desc': 'Most DMs sent',
  'clicks-desc': 'Most clicks',
  'name-asc': 'Name (A-Z)',
  'status-desc': 'Enabled first',
};

/** Formats a count for display. A null stats object means "Zernio did not answer", which must
 * read differently from a real zero - otherwise a failed stats fetch looks like an automation
 * that has never sent anything. */
function formatCount(value: number | undefined | null): string {
  return value === undefined || value === null ? '—' : value.toLocaleString();
}

export function AutomationsBrowser({ automations }: { automations: AutomationListItem[] }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('sent-desc');

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = query
      ? automations.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            item.keywords.some((keyword) => keyword.toLowerCase().includes(query)) ||
            (item.accountUsername ?? '').toLowerCase().includes(query) ||
            (item.post?.caption ?? '').toLowerCase().includes(query),
        )
      : automations;

    // Copy before sorting - Array.prototype.sort mutates, and `automations` is props.
    return [...matched].sort((a, b) => {
      switch (sort) {
        case 'sent-desc':
          return (b.stats?.dmsSent ?? -1) - (a.stats?.dmsSent ?? -1);
        case 'clicks-desc':
          return (b.stats?.linkClicks ?? -1) - (a.stats?.linkClicks ?? -1);
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'status-desc':
          return Number(b.isActive) - Number(a.isActive);
      }
    });
  }, [automations, search, sort]);

  if (automations.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted shadow-sm">
        No automations yet. Open a post from &quot;View posts&quot; above to create one.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search automations"
            aria-label="Search automations"
            className="w-full rounded-lg border border-border-strong bg-surface py-2 pl-8 pr-3 text-sm text-text placeholder:text-text-faint"
          />
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-text-faint">
            ⌕
          </span>
        </div>
        <label className="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm text-text">
          <span className="text-text-faint">↑↓</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            aria-label="Sort automations"
            className="bg-transparent text-sm font-medium text-text focus:outline-none"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted shadow-sm">
          No automations match &quot;{search}&quot;.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {/* Table on wider screens */}
          <table className="hidden w-full border-collapse text-sm md:table">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                <th className="px-4 py-3">Automation</th>
                <th className="px-4 py-3">Post</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3 text-right">Clicks</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((automation) => (
                <tr
                  key={automation.id}
                  className="border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PostThumbnail post={automation.post} />
                      <div className="min-w-0">
                        <div className="font-semibold text-text">{automation.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                          <span className="rounded-full bg-muted-bg px-2 py-0.5 font-medium">
                            {MATCH_MODE_LABEL[automation.matchMode]}
                          </span>
                          {automation.keywords.join(', ')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-text-muted">
                    <span className="block truncate">
                      {automation.post?.caption?.trim() || `@${automation.accountUsername ?? ''}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-text">
                    {formatCount(automation.stats?.dmsSent)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-text">
                    {formatCount(automation.stats?.linkClicks)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill isActive={automation.isActive} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <LoadingLink
                      href={`/instagram/posts/${automation.zernioPostId}?accountId=${automation.instagramAccountId}`}
                      className="text-accent hover:underline"
                    >
                      View →
                    </LoadingLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Stacked cards on narrow screens - same data, no sideways scrolling */}
          <ul className="divide-y divide-border md:hidden">
            {visible.map((automation) => (
              <li key={automation.id} className="p-4">
                <div className="flex items-start gap-3">
                  <PostThumbnail post={automation.post} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-text">{automation.name}</div>
                      <StatusPill isActive={automation.isActive} />
                    </div>
                    <div className="mt-0.5 text-xs text-text-muted">
                      @{automation.accountUsername ?? ''}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                  <span className="rounded-full bg-muted-bg px-2 py-0.5 font-medium">
                    {MATCH_MODE_LABEL[automation.matchMode]}
                  </span>
                  {automation.keywords.join(', ')}
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                  <span>
                    Sent{' '}
                    <span className="font-semibold text-text">
                      {formatCount(automation.stats?.dmsSent)}
                    </span>
                  </span>
                  <span>
                    Clicks{' '}
                    <span className="font-semibold text-text">
                      {formatCount(automation.stats?.linkClicks)}
                    </span>
                  </span>
                </div>
                <LoadingLink
                  href={`/instagram/posts/${automation.zernioPostId}?accountId=${automation.instagramAccountId}`}
                  className="mt-2 inline-block text-sm text-accent hover:underline"
                >
                  View →
                </LoadingLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PostThumbnail({ post }: { post: AutomationPostPreview | null }) {
  if (post?.thumbnailUrl) {
    // Plain <img>, not next/image: thumbnails come from Zernio/Instagram's own CDN (arbitrary,
    // unconfigured remote hosts), not an asset this app optimizes.
    return (
      <img
        src={post.thumbnailUrl}
        alt=""
        loading="lazy"
        className="h-10 w-10 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted-bg text-text-faint">
      ▣
    </div>
  );
}

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? 'shrink-0 rounded-full border border-success-border bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success'
          : 'shrink-0 rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-semibold text-text-faint'
      }
    >
      {isActive ? 'Enabled' : 'Disabled'}
    </span>
  );
}
