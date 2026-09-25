import { ApiError } from '@/lib/api';
import { loadPostDetail } from '@/app/instagram/posts/[postId]/post-detail-data';
import { formatDateTime } from '@/lib/format-date';
import { EditAutomationModal } from '@/views/shared/automation/edit-automation-modal';
import { LoadingLink } from '@/views/shared/loader';
import { CreateAutomationModal } from '@/views/shared/automation/create-automation-modal';

/** The desktop post detail screen. The route (app/instagram/posts/[postId]/page.tsx) has already
 * validated the ids and built `backQuery` - the posts list's own view state, carried through so
 * "Back to posts" restores it. */
export async function DesktopPostDetailView({
  organizationId,
  accountId,
  postId,
  backQuery,
}: {
  organizationId: string;
  accountId: string;
  postId: string;
  backQuery: string;
}) {
  const backToPostsHref = `/instagram/posts?${backQuery}`;

  // The fetch (and why the post and its automations load together) lives in post-detail-data.ts,
  // shared with the mobile view.
  const result = await loadPostDetail(organizationId, accountId, postId);

  if (!result.ok) {
    const error: unknown = result.error;
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

  const { post, automations } = result;
  const existingAutomation = automations[0];

  return (
    <div className="space-y-4">
      <LoadingLink href={backToPostsHref} className="text-sm text-text-muted hover:text-text">
        ← Back to posts
      </LoadingLink>
      {/* Status messages are handled globally by ToastHost (views/shared/toast.tsx), which reads the
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
                  redirectTo={`/instagram/posts/${postId}?${backQuery}`}
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
