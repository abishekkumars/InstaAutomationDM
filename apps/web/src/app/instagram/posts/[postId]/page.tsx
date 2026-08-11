import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';

interface InstagramPostDetail {
  zernioPostId: string;
  platformPostId: string | null;
  permalink: string | null;
  caption: string;
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

async function getPrimaryOrganizationId(): Promise<string | null> {
  const organizations = await callApi<Array<{ id: string }>>('/api/organizations');
  return organizations[0]?.id ?? null;
}

export default async function InstagramPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  searchParams: Promise<{ accountId?: string }>;
}) {
  const { postId } = await params;
  const { accountId } = await searchParams;
  if (!accountId) {
    redirect('/');
  }

  const organizationId = await getPrimaryOrganizationId();
  if (!organizationId) {
    redirect('/');
  }

  let post: InstagramPostDetail;
  try {
    post = await callApi<InstagramPostDetail>(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts/${postId}`,
    );
  } catch (error) {
    return (
      <div className="space-y-4">
        <Link
          href={`/instagram/posts?accountId=${accountId}`}
          className="text-sm text-slate-500 underline"
        >
          Back to posts
        </Link>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="font-medium">Could not load this post</p>
          <p className="mt-1 text-sm">
            {error instanceof ApiError ? error.message : 'API not reachable.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/instagram/posts?accountId=${accountId}`}
        className="text-sm text-slate-500 underline"
      >
        Back to posts
      </Link>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {post.thumbnailUrl && (
          // Plain <img>, not next/image: this comes from Zernio/Instagram's own CDN (an
          // arbitrary, unconfigured remote host), not an asset this app optimizes.
          <img
            src={post.thumbnailUrl}
            alt=""
            className="mb-4 max-h-96 w-full rounded-md object-contain"
          />
        )}
        <p className="whitespace-pre-wrap text-sm text-slate-700">
          {post.caption || '(no caption)'}
        </p>
        <dl className="mt-4 space-y-1 text-sm text-slate-500">
          <div>
            <dt className="inline font-medium">Type: </dt>
            <dd className="inline">{post.mediaType ?? 'unknown'}</dd>
          </div>
          {post.publishedAt && (
            <div>
              <dt className="inline font-medium">Published: </dt>
              <dd className="inline">{new Date(post.publishedAt).toLocaleString()}</dd>
            </div>
          )}
          {post.permalink && (
            <div>
              <dt className="inline font-medium">Instagram: </dt>
              <dd className="inline">
                <a href={post.permalink} target="_blank" rel="noreferrer" className="underline">
                  View on Instagram
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
