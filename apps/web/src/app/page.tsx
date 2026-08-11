import { redirect } from 'next/navigation';
import type { OrganizationRole } from '@automationdm/database';
import { ApiError, callApi } from '@/lib/api';
import { AutomationsBrowser, type AutomationListItem } from './automations-browser';
import { connectInstagramAction } from './instagram/actions';
import { FormPendingOverlay, LoadingLink } from './loader';

interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
}

interface OrganizationMemberSummary {
  id: string;
  role: OrganizationRole;
  user: { id: string; email: string; name: string | null };
}

interface InstagramAccountSummary {
  id: string;
  zernioAccountId: string;
  username: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
}

// Shape lives in automations-browser.tsx (the client component that renders it) so the two
// cannot drift apart.

type PrimaryOrganizationResult =
  | {
      status: 'ok';
      organization: OrganizationSummary;
      members: OrganizationMemberSummary[];
      instagramAccounts: InstagramAccountSummary[];
      automations: AutomationListItem[];
    }
  | { status: 'error'; message: string }
  | { status: 'none' };

async function loadPrimaryOrganization(): Promise<PrimaryOrganizationResult> {
  let organizations: OrganizationSummary[];
  try {
    organizations = await callApi<OrganizationSummary[]>('/api/organizations');
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof ApiError ? error.message : 'API not reachable.',
    };
  }

  const organization = organizations[0];
  if (!organization) {
    return { status: 'none' };
  }

  try {
    const [members, instagramAccounts, automations] = await Promise.all([
      callApi<OrganizationMemberSummary[]>(`/api/organizations/${organization.id}/members`),
      callApi<InstagramAccountSummary[]>(
        `/api/organizations/${organization.id}/instagram/accounts`,
      ),
      callApi<AutomationListItem[]>(`/api/organizations/${organization.id}/automations`),
    ]);
    return { status: 'ok', organization, members, instagramAccounts, automations };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof ApiError ? error.message : 'API not reachable.',
    };
  }
}

function StatusBanner({ instagram }: { instagram?: string }) {
  if (instagram === 'connected') {
    return (
      <div className="rounded-lg border border-success-border bg-success-bg p-3 text-sm text-success">
        Instagram account connected.
      </div>
    );
  }
  if (instagram === 'already-connected') {
    return (
      <div className="rounded-lg border border-success-border bg-success-bg p-3 text-sm text-success">
        This Instagram account was already connected — no need to authorize it again.
      </div>
    );
  }
  if (instagram === 'error') {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
        Could not connect your Instagram account. Please try again.
      </div>
    );
  }
  return null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ instagram?: string }>;
}) {
  const { instagram } = await searchParams;
  const result = await loadPrimaryOrganization();

  if (result.status === 'none') {
    redirect('/onboarding');
  }

  if (result.status === 'error') {
    return (
      <div className="space-y-4">
        <StatusBanner instagram={instagram} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="font-medium">Could not load your organization</p>
          <p className="mt-1 text-sm">{result.message}</p>
        </div>
      </div>
    );
  }

  const { organization, members, instagramAccounts, automations } = result;
  const activeCount = automations.filter((a) => a.isActive).length;
  const disabledCount = automations.length - activeCount;
  const totals = sumStats(automations);

  return (
    <div className="space-y-5">
      <StatusBanner instagram={instagram} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-[26px]">
            Automations
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {organization.name} — comment-triggered DMs across your connected accounts.
          </p>
        </div>
      </div>

      {instagramAccounts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-medium text-text">Connect Instagram</h2>
          <p className="mt-1 text-sm text-text-muted">
            Connect a Business or Creator Instagram account to start creating automations.
          </p>
          <form action={connectInstagramAction} className="mt-3">
            <FormPendingOverlay />
            <input type="hidden" name="organizationId" value={organization.id} />
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
            >
              Connect Instagram
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              eyebrow="Active automations"
              value={
                <>
                  {activeCount}
                  <span className="text-base font-semibold text-text-faint">
                    {' '}
                    / {automations.length}
                  </span>
                </>
              }
              sub={disabledCount > 0 ? `${disabledCount} disabled` : 'all enabled'}
            />
            <StatCard
              eyebrow="DMs sent"
              value={totals.hasStats ? totals.dmsSent.toLocaleString() : '—'}
              sub={
                totals.hasStats ? 'Zernio stats.dmsSent, all-time' : 'stats unavailable right now'
              }
            />
            <StatCard
              eyebrow="Button clicks"
              value={totals.hasStats ? totals.linkClicks.toLocaleString() : '—'}
              // CTR uses trackedSends, not dmsSent, per Zernio's own spec - a DM with no
              // tracked link can never be clicked, so dmsSent would understate the rate.
              sub={
                totals.hasStats
                  ? totals.ctr === null
                    ? 'Zernio stats.linkClicks'
                    : `Zernio stats.linkClicks · ${totals.ctr.toFixed(1)}% CTR`
                  : 'stats unavailable right now'
              }
            />
            <StatCard
              eyebrow="Connected accounts"
              value={String(instagramAccounts.length)}
              sub={instagramAccounts.map((a) => `@${a.username ?? a.zernioAccountId}`).join(', ')}
            />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="text-sm font-medium text-text">Connected accounts</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-text-muted">
              {instagramAccounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3">
                  <span>
                    @{account.username ?? account.zernioAccountId} —{' '}
                    <span
                      className={
                        account.status === 'CONNECTED' ? 'text-success' : 'text-text-faint'
                      }
                    >
                      {account.status.toLowerCase()}
                    </span>
                  </span>
                  <LoadingLink
                    href={`/instagram/posts?accountId=${account.id}`}
                    className="shrink-0 text-accent hover:underline"
                  >
                    View posts →
                  </LoadingLink>
                </li>
              ))}
            </ul>
          </div>

          <AutomationsBrowser automations={automations} />

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="text-sm font-medium text-text">Team</h2>
            <ul className="mt-2 space-y-1 text-sm text-text-muted">
              {members.map((member) => (
                <li key={member.id}>
                  {member.user.name ?? member.user.email} —{' '}
                  <span className="text-text-faint">{member.role.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/** Org-wide totals for the stat cards. `hasStats` is false when Zernio returned no stats for
 * any automation (unreachable, or none have stats yet) - the cards then show a dash instead of
 * a fabricated 0, so a failed fetch never reads as "nothing has been sent". CTR is computed
 * from summed trackedSends per Zernio's own spec, not from dmsSent. */
function sumStats(automations: AutomationListItem[]): {
  hasStats: boolean;
  dmsSent: number;
  linkClicks: number;
  ctr: number | null;
} {
  const withStats = automations.filter((a) => a.stats !== null);
  if (withStats.length === 0) {
    return { hasStats: false, dmsSent: 0, linkClicks: 0, ctr: null };
  }

  let dmsSent = 0;
  let linkClicks = 0;
  // Recovered from each row's own rate rather than exposing trackedSends through the API:
  // clicks / (clicks / rate) === the row's trackedSends, so summing gives the right
  // denominator for an org-wide rate without widening the API surface.
  let trackedSends = 0;
  for (const automation of withStats) {
    const stats = automation.stats;
    if (!stats) continue;
    dmsSent += stats.dmsSent;
    linkClicks += stats.linkClicks;
    if (stats.clickThroughRate !== null && stats.clickThroughRate > 0) {
      trackedSends += (stats.linkClicks / stats.clickThroughRate) * 100;
    }
  }

  return {
    hasStats: true,
    dmsSent,
    linkClicks,
    ctr: trackedSends > 0 ? (linkClicks / trackedSends) * 100 : null,
  };
}

function StatCard({
  eyebrow,
  value,
  sub,
}: {
  eyebrow: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        {eyebrow}
      </div>
      <div className="mt-1.5 text-2xl font-bold text-text">{value}</div>
      {sub && <div className="mt-1 truncate text-[11px] text-text-faint">{sub}</div>}
    </div>
  );
}
