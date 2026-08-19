import { LoadingLink } from '../../../loader';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';
import { getPrimaryOrganizationId } from '@/lib/organization';
import { formatDateTime } from '@/lib/format-date';
import { CreateAutomationModal } from './create-automation-modal';
import { EditAutomationModal } from '@/app/edit-automation-modal';

interface InstagramPostDetail {
  /** Instagram's own media id - the pivot since Phase 17, and what the post route keys on. */
  platformPostId: string;
  permalink: string | null;
  caption: string;
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

interface AutomationSummary {
  id: string;
  platformPostId: string;
  name: string;
  /** Empty means the automation triggers on any comment (Phase 16.2, requirement 12). */
  keywords: string[];
  matchMode: 'CONTAINS' | 'WORD' | 'EXACT';
  audience: 'ANY' | 'FOLLOWER' | 'NON_FOLLOWER';
  commentReply: string | null;
  commentReplyVariations: string[];
  buttons: { title: string; url: string }[];
  dmMessage: string;
  isActive: boolean;
}

export default async function InstagramPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  // `automation` is still present in the URL but read by ToastHost, not here. view/sort/size/
  // page are the posts list's own view state, carried through so "Back to posts" restores it.
  searchParams: Promise<{
    accountId?: string;
    view?: string;
    sort?: string;
    size?: string;
    page?: string;
  }>;
}) {
  const { postId } = await params;
  const { accountId, view, sort, size, page } = await searchParams;
  if (!accountId) {
    redirect('/');
  }

  // Rebuilt rather than forwarded verbatim so only the known list params come back - an
  // arbitrary query string from the incoming URL is not echoed into an outgoing link.
  const backParams = new URLSearchParams({ accountId });
  if (view) backParams.set('view', view);
  if (sort) backParams.set('sort', sort);
  if (size) backParams.set('size', size);
  if (page) backParams.set('page', page);
  const backToPostsHref = `/instagram/posts?${backParams.toString()}`;

  const organizationId = await getPrimaryOrganizationId();
  if (!organizationId) {
    redirect('/');
  }

  // Fired together, not one after the other: both depend only on ids already in hand, and this
  // page used to await them in sequence purely because each wanted its own catch. That cost a
  // full round trip normally, and up to ~1.9s whenever the automations lookup falls through to
  // reconcileFromZernio (which itself makes two Zernio calls). allSettled preserves the original
  // asymmetry - a failed post is fatal to the page, a failed automations lookup is not.
  const basePath = `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts/${postId}`;
  const [postResult, automationsResult] = await Promise.allSettled([
    callApi<InstagramPostDetail>(basePath),
    callApi<AutomationSummary[]>(`${basePath}/automations`),
  ]);

  if (postResult.status === 'rejected') {
    const error: unknown = postResult.reason;
    return (
      <div className="space-y-4">
        <LoadingLink href={backToPostsHref} className="text-sm text-text-muted hover:text-text">
          ← Back to posts
        </LoadingLink>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="font-medium">Could not load this post</p>
          <p className="mt-1 text-sm">
            {error instanceof ApiError ? error.message : 'API not reachable.'}
          </p>
        </div>
      </div>
    );
  }

  const post = postResult.value;
  // Non-fatal: the post itself loaded. Fall through with an empty list so the page still renders
  // (worst case the create form shows when one already exists, which the create endpoint then
  // correctly rejects).
  const automations = automationsResult.status === 'fulfilled' ? automationsResult.value : [];
  const existingAutomation = automations[0];

  return (
    <div className="space-y-4">
      <LoadingLink href={backToPostsHref} className="text-sm text-text-muted hover:text-text">
        ← Back to posts
      </LoadingLink>
      {/* Status messages are handled globally by ToastHost (app/toast.tsx), which reads the
          same ?automation= param the server actions redirect with. */}
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
            {formatDateTime(post.publishedAt) && <span>{formatDateTime(post.publishedAt)}</span>}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 truncate text-base font-semibold text-text">
                {existingAutomation.name}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    existingAutomation.isActive
                      ? 'rounded-full border border-success-border bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success'
                      : 'rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-semibold text-text-faint'
                  }
                >
                  {existingAutomation.isActive ? 'Enabled' : 'Disabled'}
                </span>
                <EditAutomationModal
                  organizationId={organizationId}
                  automation={existingAutomation}
                  redirectTo={`/instagram/posts/${postId}?${backParams.toString()}`}
                />
              </div>
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
              Edit changes this automation on Zernio immediately. Deleting it stops the replies and
              DMs for good.
            </p>
          </>
        ) : (
          <div className="flex flex-col items-start gap-2 py-4">
            <h2 className="text-base font-semibold text-text">No automation yet</h2>
            <p className="text-sm text-text-muted">
              Set a keyword trigger, an optional public reply, and the DM this post should send.
            </p>
            <div className="mt-2">
              <CreateAutomationModal
                organizationId={organizationId}
                accountId={accountId}
                postId={postId}
                postCaption={post.caption}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
