import { Suspense } from 'react';
import { LoadingLink } from '../../loader';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';
import { getPrimaryOrganizationId } from '@/lib/organization';
import { getAutomations } from '@/app/dashboard-data';
import { PostsGridSkeleton } from '@/app/skeleton';
import { PostsBrowser, type InstagramPostSummary } from './posts-browser';

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

export default async function InstagramPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const { accountId } = await searchParams;
  if (!accountId) {
    redirect('/');
  }

  // Above the Suspense boundary: this decides a redirect, which is impossible once a fallback has
  // streamed. It is one cheap API call with no Zernio fan-out.
  const organizationId = await getPrimaryOrganizationId();
  if (!organizationId) {
    redirect('/');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div>
        <LoadingLink href="/" className="text-sm text-text-muted hover:text-text">
          ← Back to dashboard
        </LoadingLink>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-[26px]">Posts</h1>
        <p className="text-sm text-text-muted">
          Pick a post or reel to view or create its comment automation.
        </p>
      </div>

      {/* The 500-post fetch behind this boundary is the slowest call on the page (measured
          0.66-1.73s against Zernio, 169 KB), so the heading paints first and the grid fills in. */}
      <Suspense fallback={<PostsGridSkeleton />}>
        <PostsSection organizationId={organizationId} accountId={accountId} />
      </Suspense>
    </div>
  );
}

async function PostsSection({
  organizationId,
  accountId,
}: {
  organizationId: string;
  accountId: string;
}) {
  // Fired together: the posts fetch is the slow one (0.66-1.73s against Zernio) and the
  // automations list is already cached and memoized by the dashboard's own fetcher, so pairing
  // them costs no extra round trip in the common case.
  //
  // allSettled, not all: which posts have automations is decoration. If that lookup fails the
  // posts must still list - just without badges - whereas a failed posts fetch is fatal here.
  const [postsResult, automationsResult] = await Promise.allSettled([
    callApi<ListPostsResponse>(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts?page=1&limit=${FETCH_LIMIT}`,
    ),
    getAutomations(organizationId),
  ]);

  if (postsResult.status === 'rejected') {
    const error: unknown = postsResult.reason;
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        <p className="font-medium">Could not load posts</p>
        <p className="mt-1 text-sm">
          {error instanceof ApiError ? error.message : 'API not reachable.'}
        </p>
      </div>
    );
  }

  // Maps platformPostId -> whether that post's automation is currently enabled, so the badge can
  // distinguish an active automation from a paused one. Scoped to this account's automations:
  // the org-wide list covers every connected account, and a post id from another account could
  // otherwise badge a post it has nothing to do with.
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

  return (
    <PostsBrowser
      posts={postsResult.value.posts}
      accountId={accountId}
      automationsByPostId={automationsByPostId}
    />
  );
}
