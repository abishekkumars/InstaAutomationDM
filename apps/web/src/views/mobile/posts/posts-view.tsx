import { Suspense } from 'react';
import { ApiError } from '@/lib/api';
import { getInstagramAccounts } from '@/app/dashboard-data';
import { loadPostsWithAutomationState } from '@/app/instagram/posts/posts-data';
import { MobileNotice } from '../notice';
import { MobilePageHeader } from '../page-header';
import { MobilePostsGrid } from './posts-grid';

/** The mobile "+" tab (Phase 18.4): every post and reel of one connected account as a grid, each
 * marked when it already has an automation. Tapping one opens its detail page, where the
 * automation is created, edited, paused or resumed.
 *
 * The route has already resolved and validated both ids, including the redirects that must
 * happen before anything streams. */
export function MobilePostsView({
  organizationId,
  accountId,
}: {
  organizationId: string;
  accountId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <MobilePageHeader eyebrow="New automation" title="Choose a post">
        <p className="-mt-2 text-sm leading-5 text-text-muted">
          Pick a post or reel to view or create its comment automation.
        </p>
      </MobilePageHeader>
      {/* The 500-post fetch is the slowest call on the page (0.66-1.73s against Zernio), so the
          heading paints first and the grid fills in. */}
      <Suspense fallback={<GridSkeleton />}>
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
  const [result, accounts] = await Promise.all([
    loadPostsWithAutomationState(organizationId, accountId),
    getInstagramAccounts(organizationId).catch(() => []),
  ]);

  if (!result.ok) {
    return (
      <MobileNotice tone="warning" title="Could not load posts">
        {result.error instanceof ApiError ? result.error.message : 'API not reachable.'}
      </MobileNotice>
    );
  }

  const account = accounts.find((candidate) => candidate.id === accountId);
  const handle = account ? `@${account.username ?? account.zernioAccountId}` : 'Instagram account';

  return (
    <MobilePostsGrid
      posts={result.posts}
      accountId={accountId}
      accountHandle={handle}
      automationsByPostId={result.automationsByPostId}
    />
  );
}

function GridSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-[58px] rounded-[18px] bg-seg" />
      <div className="h-[46px] rounded-[14px] bg-seg" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="aspect-square rounded-2xl bg-seg" />
        ))}
      </div>
    </div>
  );
}
