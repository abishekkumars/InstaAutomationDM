'use client';

import { useState } from 'react';
import type { InstagramPostSummary } from '@/app/instagram/posts/posts-data';
import { LoadingLink } from '@/views/shared/loader';
import { ImageIcon, InstagramIcon, ReelIcon } from '../icons';

type Segment = 'all' | 'reels' | 'posts';

/** Tiles rendered before "Show more". An account can have up to 500 synced posts, and a phone
 * gains nothing from laying out hundreds of thumbnails nobody has scrolled to. */
const PAGE = 60;

function isReel(post: InstagramPostSummary): boolean {
  // Reels (and any other video) arrive from Zernio/Meta as `video`.
  return post.mediaType === 'video';
}

/** The posts grid's interactive part: the All / Reels / Posts segment and the tiles. */
export function MobilePostsGrid({
  posts,
  accountId,
  accountHandle,
  automationsByPostId,
}: {
  posts: InstagramPostSummary[];
  accountId: string;
  accountHandle: string;
  automationsByPostId: Record<string, boolean>;
}) {
  const [segment, setSegment] = useState<Segment>('all');
  const [shown, setShown] = useState(PAGE);

  // Newest first, matching the desktop browser's default. Posts without a date sort last.
  const sorted = [...posts].sort(
    (a, b) => (Date.parse(b.publishedAt ?? '') || 0) - (Date.parse(a.publishedAt ?? '') || 0),
  );
  const filtered = sorted.filter((post) =>
    segment === 'all' ? true : segment === 'reels' ? isReel(post) : !isReel(post),
  );
  const visible = filtered.slice(0, shown);

  const segments: { key: Segment; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'reels', label: 'Reels' },
    { key: 'posts', label: 'Posts' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 rounded-[18px] border border-border bg-surface px-3 py-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-2-soft text-accent-2">
          <InstagramIcon size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-bold text-text">{accountHandle}</span>
          <span className="text-xs text-text-muted">
            {posts.length} {posts.length === 1 ? 'post' : 'posts'}
          </span>
        </span>
      </div>

      <div
        role="group"
        aria-label="Show"
        className="grid grid-cols-3 gap-0.5 rounded-[14px] bg-seg p-1"
      >
        {segments.map((item) => {
          const selected = segment === item.key;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setSegment(item.key);
                setShown(PAGE);
              }}
              className={`h-[38px] rounded-[11px] text-[13.5px] font-bold ${
                selected ? 'bg-seg-selected text-text shadow-sm' : 'text-text-muted'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[22px] border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
          {posts.length === 0
            ? 'No posts synced for this account yet.'
            : `No ${segment === 'reels' ? 'reels' : 'posts'} here.`}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {visible.map((post) => {
            const hasAutomation = post.platformPostId in automationsByPostId;
            const active = automationsByPostId[post.platformPostId] === true;
            const kind = isReel(post) ? 'Reel' : 'Post';
            const caption = post.caption.trim() || 'No caption';
            return (
              <li key={post.platformPostId}>
                <LoadingLink
                  href={`/instagram/posts/${post.platformPostId}?accountId=${accountId}`}
                  aria-label={`${kind}${hasAutomation ? `, automation ${active ? 'active' : 'paused'}` : ''}: ${caption}`}
                  className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-seg text-tile-icon"
                >
                  {post.thumbnailUrl ? (
                    // Plain <img>: Instagram's CDN is not a host this app optimizes.
                    <img
                      src={post.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : isReel(post) ? (
                    <ReelIcon size={26} strokeWidth={1.7} />
                  ) : (
                    <ImageIcon size={26} strokeWidth={1.7} />
                  )}
                  {isReel(post) && post.thumbnailUrl && (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-black/45 p-1 text-white">
                      <ReelIcon size={12} strokeWidth={2.2} />
                    </span>
                  )}
                  {hasAutomation && (
                    <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-glass px-[7px] py-[3px] text-[10.5px] font-bold text-text backdrop-blur-md">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-warn'}`}
                      />
                      {active ? 'Active' : 'Paused'}
                    </span>
                  )}
                </LoadingLink>
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > shown && (
        <button
          type="button"
          onClick={() => setShown((count) => count + PAGE)}
          className="h-12 rounded-2xl border border-border bg-surface text-sm font-bold text-text"
        >
          Show more ({filtered.length - shown} left)
        </button>
      )}
    </div>
  );
}
