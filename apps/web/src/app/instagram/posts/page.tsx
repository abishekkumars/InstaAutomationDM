import { Suspense } from 'react';
import { LoadingLink } from '../../loader';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';
import { getPrimaryOrganizationId } from '@/lib/organization';
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
  let result: ListPostsResponse;
  try {
    result = await callApi<ListPostsResponse>(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts?page=1&limit=${FETCH_LIMIT}`,
    );
  } catch (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        <p className="font-medium">Could not load posts</p>
        <p className="mt-1 text-sm">
          {error instanceof ApiError ? error.message : 'API not reachable.'}
        </p>
      </div>
    );
  }

  return <PostsBrowser posts={result.posts} accountId={accountId} />;
}
