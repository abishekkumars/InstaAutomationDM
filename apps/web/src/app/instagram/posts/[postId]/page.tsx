import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';
import { createAutomationAction } from './actions';

interface InstagramPostDetail {
  zernioPostId: string;
  platformPostId: string | null;
  permalink: string | null;
  caption: string;
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

interface AutomationSummary {
  id: string;
  zernioPostId: string;
  name: string;
  keywords: string[];
  matchMode: 'CONTAINS' | 'WORD' | 'EXACT';
  commentReply: string | null;
  dmMessage: string;
  isActive: boolean;
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
  searchParams: Promise<{ accountId?: string; automation?: string }>;
}) {
  const { postId } = await params;
  const { accountId, automation } = await searchParams;
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

  let automations: AutomationSummary[] = [];
  try {
    automations = await callApi<AutomationSummary[]>(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts/${postId}/automations`,
    );
  } catch {
    // Non-fatal: the post itself already loaded above. Fall through with an empty list so
    // the page still renders (worst case, the create form shows when one already exists,
    // which the create endpoint itself would then correctly reject).
  }
  const existingAutomation = automations[0];

  return (
    <div className="space-y-4">
      <Link
        href={`/instagram/posts?accountId=${accountId}`}
        className="text-sm text-slate-500 underline"
      >
        Back to posts
      </Link>
      {automation === 'created' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Automation created.
        </div>
      )}
      {automation === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not create the automation. Please check your input and try again.
        </div>
      )}
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

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium">Comment automation</h2>
        {existingAutomation ? (
          <dl className="mt-2 space-y-1 text-sm text-slate-600">
            <div>
              <dt className="inline font-medium">Name: </dt>
              <dd className="inline">{existingAutomation.name}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Keywords: </dt>
              <dd className="inline">{existingAutomation.keywords.join(', ')}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Match mode: </dt>
              <dd className="inline">{existingAutomation.matchMode.toLowerCase()}</dd>
            </div>
            {existingAutomation.commentReply && (
              <div>
                <dt className="inline font-medium">Public reply: </dt>
                <dd className="inline">{existingAutomation.commentReply}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium">DM message: </dt>
              <dd className="inline">{existingAutomation.dmMessage}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Status: </dt>
              <dd className="inline">{existingAutomation.isActive ? 'active' : 'inactive'}</dd>
            </div>
          </dl>
        ) : (
          <form action={createAutomationAction} className="mt-2 space-y-3">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="postId" value={postId} />
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="keywords" className="block text-sm font-medium text-slate-700">
                Keywords
              </label>
              <input
                id="keywords"
                name="keywords"
                type="text"
                required
                placeholder="link, price, info"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Comma-separated. Any comment matching one of these triggers the automation.
              </p>
            </div>
            <div>
              <label htmlFor="matchMode" className="block text-sm font-medium text-slate-700">
                Match mode
              </label>
              <select
                id="matchMode"
                name="matchMode"
                defaultValue="contains"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="contains">Contains - keyword appears anywhere</option>
                <option value="word">Word - keyword as a standalone word</option>
                <option value="exact">Exact - comment matches a keyword exactly</option>
              </select>
            </div>
            <div>
              <label htmlFor="commentReply" className="block text-sm font-medium text-slate-700">
                Public reply (optional)
              </label>
              <input
                id="commentReply"
                name="commentReply"
                type="text"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="dmMessage" className="block text-sm font-medium text-slate-700">
                DM message
              </label>
              <textarea
                id="dmMessage"
                name="dmMessage"
                required
                rows={3}
                maxLength={1000}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Create automation
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
