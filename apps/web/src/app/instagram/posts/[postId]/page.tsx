import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';
import { createAutomationAction } from './actions';
import { DmMessageField } from './dm-message-field';
import { KeywordsField } from './keywords-field';

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
  buttons: { title: string; url: string }[];
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
        className="text-sm text-text-muted hover:text-text"
      >
        ← Back to posts
      </Link>
      {automation === 'created' && (
        <div className="rounded-lg border border-success-border bg-success-bg p-3 text-sm text-success">
          Automation created.
        </div>
      )}
      {automation === 'error' && (
        <div className="rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          Could not create the automation. Please check your input and try again.
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {post.thumbnailUrl && (
          // Plain <img>, not next/image: this comes from Zernio/Instagram's own CDN (an
          // arbitrary, unconfigured remote host), not an asset this app optimizes.
          <img src={post.thumbnailUrl} alt="" className="max-h-96 w-full object-contain" />
        )}
        <div className="p-4">
          <p className="whitespace-pre-wrap text-sm text-text">{post.caption || '(no caption)'}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            <span>{post.mediaType ?? 'unknown'}</span>
            {post.publishedAt && <span>{new Date(post.publishedAt).toLocaleString()}</span>}
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                View on Instagram ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        {existingAutomation ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">{existingAutomation.name}</h2>
              <span
                className={
                  existingAutomation.isActive
                    ? 'rounded-full border border-success-border bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success'
                    : 'rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-semibold text-text-faint'
                }
              >
                {existingAutomation.isActive ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-text-muted">Keywords</dt>
              <dd className="flex flex-wrap gap-1.5">
                {existingAutomation.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-medium text-text"
                  >
                    {keyword}
                  </span>
                ))}
              </dd>
              <dt className="text-text-muted">Match mode</dt>
              <dd className="text-text">{existingAutomation.matchMode.toLowerCase()}</dd>
              {existingAutomation.commentReply && (
                <>
                  <dt className="text-text-muted">Public reply</dt>
                  <dd className="text-text">"{existingAutomation.commentReply}"</dd>
                </>
              )}
              <dt className="text-text-muted">DM message</dt>
              <dd className="text-text">"{existingAutomation.dmMessage}"</dd>
              {existingAutomation.buttons.length > 0 && (
                <>
                  <dt className="text-text-muted">Buttons</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {existingAutomation.buttons.map((button) => (
                      <a
                        key={button.url}
                        href={button.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-medium text-text hover:underline"
                      >
                        {button.title} ↗
                      </a>
                    ))}
                  </dd>
                </>
              )}
            </dl>
            <p className="mt-4 text-xs text-text-faint">
              Editing and pausing aren't available yet — that needs an update/delete endpoint (a
              later phase). For now, creating an automation is one-way.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-text">Create comment automation</h2>
            <form action={createAutomationAction} className="mt-3 space-y-4">
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="postId" value={postId} />
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-text">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                />
              </div>
              <KeywordsField />
              <div>
                <label htmlFor="matchMode" className="block text-sm font-medium text-text">
                  Match mode
                </label>
                <select
                  id="matchMode"
                  name="matchMode"
                  defaultValue="contains"
                  className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                >
                  <option value="contains">Contains — keyword appears anywhere</option>
                  <option value="word">Word — keyword as a standalone word</option>
                  <option value="exact">Exact — comment matches a keyword exactly</option>
                </select>
              </div>
              <div>
                <label htmlFor="commentReply" className="block text-sm font-medium text-text">
                  Public reply (optional)
                </label>
                <input
                  id="commentReply"
                  name="commentReply"
                  type="text"
                  className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                />
              </div>
              <DmMessageField />
              <button
                type="submit"
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 sm:w-auto"
              >
                Create automation
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
