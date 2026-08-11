import { LoadingLink } from '../../loader';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';
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

// This app currently only ever shows the caller's first organization (same convention as
// app/page.tsx's dashboard - there is no multi-org switcher yet), so the primary organization
// id is looked up the same way here rather than threaded through the URL.
async function getPrimaryOrganizationId(): Promise<string | null> {
  const organizations = await callApi<Array<{ id: string }>>('/api/organizations');
  return organizations[0]?.id ?? null;
}

export default async function InstagramPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const { accountId } = await searchParams;
  if (!accountId) {
    redirect('/');
  }

  const organizationId = await getPrimaryOrganizationId();
  if (!organizationId) {
    redirect('/');
  }

  let result: ListPostsResponse;
  try {
    result = await callApi<ListPostsResponse>(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts?page=1&limit=${FETCH_LIMIT}`,
    );
  } catch (error) {
    return (
      <div className="space-y-4">
        <LoadingLink href="/" className="text-sm text-slate-500 underline">
          Back to dashboard
        </LoadingLink>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="font-medium">Could not load posts</p>
          <p className="mt-1 text-sm">
            {error instanceof ApiError ? error.message : 'API not reachable.'}
          </p>
        </div>
      </div>
    );
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

      <PostsBrowser posts={result.posts} accountId={accountId} />
    </div>
  );
}
