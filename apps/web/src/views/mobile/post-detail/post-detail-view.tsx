import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format-date';
import { getAutomations } from '@/app/dashboard-data';
import { getTemplates } from '@/app/templates/templates-data';
import {
  loadPostDetail,
  type AutomationSummary,
} from '@/app/instagram/posts/[postId]/post-detail-data';
import { CreateAutomationModal } from '@/views/shared/automation/create-automation-modal';
import { EditAutomationModal } from '@/views/shared/automation/edit-automation-modal';
import { LoadingLink } from '@/views/shared/loader';
import { ImageIcon, ReelIcon } from '../icons';
import { MobileNotice } from '../notice';
import { MobilePageHeader } from '../page-header';
import { PauseResumeButton } from './pause-resume-button';

const numberFormat = new Intl.NumberFormat('en-US');

const AUDIENCE_LABEL: Record<AutomationSummary['audience'], string> = {
  ANY: 'Everyone',
  FOLLOWER: 'Followers only',
  NON_FOLLOWER: 'Non-followers',
};

/** The mobile post detail (Phase 18.4): the post, and its automation - trigger, the DM people
 * receive, live stats, and Edit / Pause / Resume - or the button that starts one.
 *
 * Create and edit open the same dialogs the desktop uses (views/shared/automation), which are
 * already full-screen on a phone. Only their opener buttons are styled for touch here, so the
 * two views cannot drift apart in what an automation can be set to. */
export async function MobilePostDetailView({
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
  const backHref = `/instagram/posts?${backQuery}`;
  // Stats come from the org-wide automations list, which is already cached and memoized; the
  // per-post endpoint does not carry them. Never fatal - without it the stats show as a dash.
  // Templates (Phase 19) pre-fill the create popup; a failed fetch just means a blank form.
  const [result, allAutomations, templates] = await Promise.all([
    loadPostDetail(organizationId, accountId, postId),
    getAutomations(organizationId).catch(() => []),
    getTemplates(organizationId).catch(() => []),
  ]);

  const backButton = (
    <LoadingLink
      href={backHref}
      aria-label="Back to posts"
      className="flex h-11 items-center gap-1 rounded-[14px] border border-border bg-surface pr-3.5 pl-2 text-sm font-bold text-text"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      Posts
    </LoadingLink>
  );

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div>{backButton}</div>
        <MobileNotice tone="warning" title="Could not load this post">
          {result.error instanceof ApiError ? result.error.message : 'API not reachable.'}
        </MobileNotice>
      </div>
    );
  }

  const { post, automations } = result;
  const automation = automations[0];
  const stats = automation
    ? (allAutomations.find((candidate) => candidate.id === automation.id)?.stats ?? null)
    : null;
  const reel = post.mediaType === 'video';
  const kind = reel ? 'Reel' : 'Post';
  const published = formatDateTime(post.publishedAt);

  return (
    <div className="flex flex-col gap-4">
      <div>{backButton}</div>
      <MobilePageHeader
        eyebrow={published ?? undefined}
        title={`${kind} details`}
        compactTitle={kind}
        compactSubtitle={automation ? automation.name : 'No automation yet'}
        compactLeading={backButton}
      />

      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[26px] bg-seg text-tile-icon">
        {post.thumbnailUrl ? (
          // Plain <img>: Instagram's CDN is not a host this app optimizes.
          <img
            src={post.thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : reel ? (
          <ReelIcon size={64} strokeWidth={1.3} />
        ) : (
          <ImageIcon size={64} strokeWidth={1.3} />
        )}
        <span className="absolute top-3 left-3 rounded-full bg-glass px-2.5 py-[5px] text-xs font-bold text-text backdrop-blur-md">
          {kind}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[15px] leading-[22px] whitespace-pre-wrap text-text">
          {post.caption || '(no caption)'}
        </p>
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="self-start text-[13px] font-semibold text-accent"
          >
            View on Instagram ↗
          </a>
        )}
      </div>

      {automation ? (
        <section
          aria-labelledby="automation-heading"
          className="flex flex-col gap-3.5 rounded-[24px] border border-border bg-surface p-[18px] shadow-card"
        >
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-bold tracking-[0.06em] text-text-muted uppercase">
                Automation
              </span>
              <h2 id="automation-heading" className="truncate text-base font-extrabold text-text">
                {automation.name}
              </h2>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                automation.isActive ? 'bg-success-bg text-success' : 'bg-warn-bg text-warn'
              }`}
            >
              {automation.isActive ? 'Active' : 'Paused'}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-text-muted">
              Trigger · {AUDIENCE_LABEL[automation.audience]} · {automation.matchMode.toLowerCase()}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {automation.keywords.length === 0 ? (
                <span className="rounded-full bg-accent-soft px-[11px] py-[5px] text-[13px] font-bold text-accent">
                  Any comment
                </span>
              ) : (
                automation.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full bg-accent-soft px-[11px] py-[5px] text-[13px] font-bold text-accent"
                  >
                    {keyword}
                  </span>
                ))
              )}
            </div>
          </div>

          {automation.commentReply && (
            <div className="flex flex-col gap-1">
              <span className="text-[12.5px] font-semibold text-text-muted">Public reply</span>
              <p className="text-sm text-text">&ldquo;{automation.commentReply}&rdquo;</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-text-muted">DM they receive</span>
            <div className="flex max-w-[88%] flex-col gap-2.5 self-start rounded-[18px] rounded-bl-md bg-seg px-3.5 py-3">
              <span className="text-sm leading-5 whitespace-pre-wrap text-text">
                {automation.dmMessage}
              </span>
              {automation.buttons.map((button) => (
                <a
                  key={button.url}
                  href={button.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-center text-[13px] font-bold text-accent"
                >
                  {button.title}
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="DMs sent" value={stats ? numberFormat.format(stats.dmsSent) : '—'} />
            <Stat
              label="Clicks"
              value={
                stats && automation.buttons.length > 0 ? numberFormat.format(stats.linkClicks) : '—'
              }
            />
            <Stat
              label="CTR"
              value={
                stats?.clickThroughRate !== null && stats?.clickThroughRate !== undefined
                  ? `${stats.clickThroughRate.toFixed(1)}%`
                  : '—'
              }
            />
          </div>

          <div className="flex items-start gap-2.5">
            <EditAutomationModal
              organizationId={organizationId}
              automation={automation}
              redirectTo={`/instagram/posts/${postId}?${backQuery}`}
              trigger="mobile"
            />
            <PauseResumeButton automationId={automation.id} isActive={automation.isActive} />
          </div>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-2.5 rounded-[24px] border border-border bg-surface px-[18px] py-6 text-center shadow-card">
          <h2 className="text-[17px] font-extrabold text-text">No automation yet</h2>
          <p className="text-sm leading-5 text-text-muted">
            Send an automatic DM to everyone who comments on this {kind.toLowerCase()}.
          </p>
          <div className="mt-1.5 w-full">
            <CreateAutomationModal
              organizationId={organizationId}
              accountId={accountId}
              postId={postId}
              postCaption={post.caption}
              templates={templates}
              trigger="mobile"
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] border border-border bg-surface-2 p-2.5">
      <span className="text-[17px] font-extrabold text-text">{value}</span>
      <span className="text-[11.5px] font-semibold text-text-muted">{label}</span>
    </div>
  );
}
