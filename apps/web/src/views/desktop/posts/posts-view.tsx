import { Suspense } from 'react';
import { ApiError } from '@/lib/api';
import { loadPostsWithAutomationState } from '@/app/instagram/posts/posts-data';
import { LoadingLink } from '@/views/shared/loader';
import { PostsGridSkeleton } from '@/views/desktop/skeleton';
import { PostsBrowser } from './posts-browser';

/** The desktop posts screen. The route (app/instagram/posts/page.tsx) has already resolved and
 * validated both ids, including the redirects that must happen before anything streams. */
export function DesktopPostsView({
  organizationId,
  accountId,
}: {
  organizationId: string;
  accountId: string;
}) {
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
  // The fetch itself (and why posts and automations load together) lives in posts-data.ts, shared
  // with the mobile view.
  const result = await loadPostsWithAutomationState(organizationId, accountId);

  if (!result.ok) {
    const error: unknown = result.error;
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        <p className="font-medium">Could not load posts</p>
        <p className="mt-1 text-sm">
          {error instanceof ApiError ? error.message : 'API not reachable.'}
        </p>
      </div>
    );
  }

  return (
    <PostsBrowser
      posts={result.posts}
      accountId={accountId}
      automationsByPostId={result.automationsByPostId}
    />
  );
}
