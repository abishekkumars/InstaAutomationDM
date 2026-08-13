'use client';

import { useMemo, useState } from 'react';
import { LoadingLink } from './loader';
import { EyeIcon } from './icons';
import { EditAutomationModal } from './edit-automation-modal';

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
  // Not rendered in the table itself - these are what the edit dialog pre-fills from, so the
  // row can open a fully populated form without a second round trip. The API's
  // AutomationListItem has always included them; this interface simply did not declare them.
  commentReply: string | null;
  buttons: { title: string; url: string }[];
  dmMessage: string;
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

const NAME_MAX_CHARS = 75;

/** Caps a name at 75 characters with an ellipsis. Done in JS rather than with CSS `truncate`
 * because the requirement is a hard character count, not "however much fits in the column" -
 * CSS truncation varies with viewport width and would show far more text on a wide screen. The
 * full value stays available as a `title` tooltip. */
function truncateName(name: string): string {
  return name.length > NAME_MAX_CHARS ? `${name.slice(0, NAME_MAX_CHARS)}...` : name;
}

export function AutomationsBrowser({
  organizationId,
  automations,
}: {
  organizationId: string;
  automations: AutomationListItem[];
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('sent-desc');
  // Which automation's edit dialog a row click opened, by id. Held here rather than inside each
  // row's EditAutomationModal because the clickable surface is the <tr>/<li> itself, which cannot
  // be nested inside that component - see its `openExternally` prop.
  const [editing, setEditing] = useState<string | null>(null);

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

  // Resolved from the source list, not `visible`: a save that changes the name could drop the row
  // out of the current search filter, and the open dialog must not vanish mid-edit because of it.
  const editingAutomation = editing ? (automations.find((a) => a.id === editing) ?? null) : null;

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
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((automation) => (
                <tr
                  key={automation.id}
                  // Whole row opens the edit dialog. Not wrapped in EditAutomationModal's
                  // trigger="row" div, because a <div> is not valid between <tbody> and <tr> -
                  // so the row hosts the same click/keyboard behaviour itself and drives the
                  // dialog through openEditFor below.
                  role="button"
                  tabIndex={0}
                  aria-label={`Edit ${automation.name}`}
                  onClick={(event) => {
                    // Clicks that land on the row's own icons must not also open the dialog. The
                    // icons keep their existing markup and handlers untouched.
                    if ((event.target as HTMLElement).closest('a,button,input,select,textarea')) {
                      return;
                    }
                    setEditing(automation.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setEditing(automation.id);
                    }
                  }}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PostThumbnail post={automation.post} />
                      <div className="min-w-0">
                        <div className="font-semibold text-text" title={automation.name}>
                          {truncateName(automation.name)}
                        </div>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <LoadingLink
                        href={`/instagram/posts/${automation.zernioPostId}?accountId=${automation.instagramAccountId}`}
                        className="rounded-md p-1.5 text-text-muted hover:bg-muted-bg hover:text-text"
                        title="View automation"
                        aria-label={`View ${automation.name}`}
                      >
                        <EyeIcon />
                      </LoadingLink>
                      <EditAutomationModal
                        organizationId={organizationId}
                        automation={automation}
                        redirectTo="/"
                        trigger="icon"
                      />
                      <EditAutomationModal
                        organizationId={organizationId}
                        automation={automation}
                        redirectTo="/"
                        trigger="delete-icon"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Stacked cards on narrow screens - same data, no sideways scrolling */}
          <ul className="divide-y divide-border md:hidden">
            {visible.map((automation) => (
              <li
                key={automation.id}
                // Same whole-row-opens-edit behaviour as the desktop table above.
                role="button"
                tabIndex={0}
                aria-label={`Edit ${automation.name}`}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a,button,input,select,textarea')) {
                    return;
                  }
                  setEditing(automation.id);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setEditing(automation.id);
                  }
                }}
                className="cursor-pointer p-4 hover:bg-surface-2"
              >
                <div className="flex items-start gap-3">
                  <PostThumbnail post={automation.post} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 font-semibold text-text" title={automation.name}>
                        {truncateName(automation.name)}
                      </div>
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
                <div className="mt-2 flex items-center gap-1">
                  <LoadingLink
                    href={`/instagram/posts/${automation.zernioPostId}?accountId=${automation.instagramAccountId}`}
                    className="rounded-md p-1.5 text-text-muted hover:bg-muted-bg hover:text-text"
                    title="View automation"
                    aria-label={`View ${automation.name}`}
                  >
                    <EyeIcon />
                  </LoadingLink>
                  <EditAutomationModal
                    organizationId={organizationId}
                    automation={automation}
                    redirectTo="/"
                    trigger="icon"
                  />
                  <EditAutomationModal
                    organizationId={organizationId}
                    automation={automation}
                    redirectTo="/"
                    trigger="delete-icon"
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* One instance for the whole list, keyed by id so switching rows remounts it and the form
          re-initialises from the newly selected automation's values. Rendering it here rather than
          per row keeps a single dialog in the tree regardless of how many rows are visible.
          `key` is what makes the remount happen - without it the useState initialisers would keep
          the first-opened automation's data. */}
      {editingAutomation && (
        <EditAutomationModal
          key={editingAutomation.id}
          organizationId={organizationId}
          automation={editingAutomation}
          redirectTo="/"
          openExternally
          onExternalClose={() => setEditing(null)}
        />
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
