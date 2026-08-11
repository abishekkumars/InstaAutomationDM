import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';

interface InstagramPostSummary {
  zernioPostId: string;
  platformPostId: string | null;
  permalink: string | null;
  caption: string;
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

interface ListPostsResponse {
  posts: InstagramPostSummary[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const PAGE_SIZE = 12;

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
  searchParams: Promise<{ accountId?: string; page?: string }>;
}) {
  const { accountId, page } = await searchParams;
  if (!accountId) {
    redirect('/');
  }

  const organizationId = await getPrimaryOrganizationId();
  if (!organizationId) {
    redirect('/');
  }

  const pageNumber = Number(page) > 0 ? Number(page) : 1;

  let result: ListPostsResponse;
  try {
    result = await callApi<ListPostsResponse>(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts?page=${pageNumber}&limit=${PAGE_SIZE}`,
    );
  } catch (error) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-slate-500 underline">
          Back to dashboard
        </Link>
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
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-slate-500 underline">
          Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Posts</h1>
        <p className="text-sm text-slate-500">
          Existing Instagram posts and reels for this account. Pick one to attach an automation to
          (coming in a later phase).
        </p>
      </div>

      {result.posts.length === 0 ? (
        <p className="text-sm text-slate-500">No posts found for this account yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.posts.map((post) => (
            <li
              key={post.zernioPostId}
              className="rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <Link
                href={`/instagram/posts/${post.zernioPostId}?accountId=${accountId}`}
                className="block p-4"
              >
                {post.thumbnailUrl && (
                  // Plain <img>, not next/image: thumbnails come from Zernio/Instagram's own
                  // CDN (arbitrary, unconfigured remote hosts), not an asset this app optimizes.
                  <img
                    src={post.thumbnailUrl}
                    alt=""
                    className="mb-2 aspect-square w-full rounded-md object-cover"
                  />
                )}
                <p className="line-clamp-2 text-sm text-slate-700">
                  {post.caption || '(no caption)'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {post.mediaType ?? 'unknown'}
                  {post.publishedAt && ` — ${new Date(post.publishedAt).toLocaleDateString()}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-sm">
        {result.pagination.page > 1 ? (
          <Link
            href={`/instagram/posts?accountId=${accountId}&page=${result.pagination.page - 1}`}
            className="text-slate-600 underline"
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span className="text-slate-400">
          Page {result.pagination.page} of {result.pagination.pages}
        </span>
        {result.pagination.page < result.pagination.pages ? (
          <Link
            href={`/instagram/posts?accountId=${accountId}&page=${result.pagination.page + 1}`}
            className="text-slate-600 underline"
          >
            Next
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
