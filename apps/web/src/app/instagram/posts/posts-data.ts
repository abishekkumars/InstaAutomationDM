import { callApi } from '@/lib/api';
import { getAutomations } from '@/app/dashboard-data';

/** One post or reel as the posts list shows it. Shared by the desktop and mobile posts views
 * (docs/ADR/0010-device-specific-views.md), so it lives with the fetch rather than in either. */
export interface InstagramPostSummary {
  /** Instagram's own media id - the pivot since Phase 17, and what the post route keys on. */
  platformPostId: string;
  permalink: string | null;
  caption: string;
  /** Reels arrive as `video`. */
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

interface ListPostsResponse {
  posts: InstagramPostSummary[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

// Fetch the account's whole synced window in one call instead of one server page at a time.
// Zernio's list endpoint has no search or sort parameters, so filtering and ordering happen
// client-side - and they must cover every post, not just whichever server page is on screen,
// or "search" would silently only search 12 items. 500 is Zernio's own max limit and the same
// window ZernioInstagramProvider.getPost already relies on (~12 months of synced history).
const FETCH_LIMIT = 500;

export type PostsLoadResult =
  | {
      ok: true;
      posts: InstagramPostSummary[];
      /** platformPostId -> whether that post's automation is currently enabled. */
      automationsByPostId: Record<string, boolean>;
    }
  | { ok: false; error: unknown };

/** The posts list plus which of them already have an automation.
 *
 * Fired together: the posts fetch is the slow one (0.66-1.73s against Zernio) and the automations
 * list is already cached and memoized by the dashboard's own fetcher, so pairing them costs no
 * extra round trip in the common case.
 *
 * allSettled, not all: which posts have automations is decoration. If that lookup fails the posts
 * must still list - just without badges - whereas a failed posts fetch is reported to the view. */
export async function loadPostsWithAutomationState(
  organizationId: string,
  accountId: string,
): Promise<PostsLoadResult> {
  const [postsResult, automationsResult] = await Promise.allSettled([
    callApi<ListPostsResponse>(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts?page=1&limit=${FETCH_LIMIT}`,
    ),
    getAutomations(organizationId),
  ]);

  if (postsResult.status === 'rejected') {
    return { ok: false, error: postsResult.reason };
  }

  // Scoped to this account's automations: the org-wide list covers every connected account, and a
  // post id from another account could otherwise badge a post it has nothing to do with.
  const automationsByPostId: Record<string, boolean> = {};
  if (automationsResult.status === 'fulfilled') {
    for (const automation of automationsResult.value) {
      if (automation.instagramAccountId !== accountId) continue;
      // Enabled wins if a post somehow has more than one: the badge answers "is this post
      // automated right now?", and one active automation makes that a yes.
      automationsByPostId[automation.platformPostId] =
        automationsByPostId[automation.platformPostId] || automation.isActive;
    }
  }

  return { ok: true, posts: postsResult.value.posts, automationsByPostId };
}
