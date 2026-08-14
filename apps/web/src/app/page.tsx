import { Suspense } from 'react';
import { ApiError } from '@/lib/api';
import { AutomationsBrowser } from './automations-browser';
import {
  getAutomations,
  getAutomationsWithMeta,
  getInstagramAccounts,
  getMembers,
  getOrganizations,
  sumStats,
} from './dashboard-data';
import { DataAge } from './freshness';
import { connectInstagramAction } from './instagram/actions';
import { FormPendingOverlay, LoadingLink } from './loader';
import { AutomationsTableSkeleton, CardSkeleton, StatCardsSkeleton } from './skeleton';
import { SyncButton } from './sync-button';

// Status messages are handled globally by ToastHost (app/toast.tsx), which reads the same
// ?instagram= / ?automation= params the server actions redirect with.

export default async function HomePage() {
  // Awaited here, deliberately ABOVE every Suspense boundary below: this call decides whether the
  // page is a dashboard at all or the awaiting-access state, and the two share no layout, so
  // flushing dashboard skeletons first would show a user structure that is about to be replaced
  // wholesale. (Until Phase 15.3 this was a `redirect()`, which had a harder version of the same
  // constraint - a redirect cannot change a response that has already begun streaming.) One fast
  // API call, ~0.2s, no Zernio and no enrichment; everything expensive happens inside the
  // boundaries.
  let organizations;
  try {
    organizations = await getOrganizations();
  } catch (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        <p className="font-medium">Could not load your organization</p>
        <p className="mt-1 text-sm">
          {error instanceof ApiError ? error.message : 'API not reachable.'}
        </p>
      </div>
    );
  }

  const organization = organizations[0];
  if (!organization) {
    return <AwaitingAccess />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-[26px]">
            Automations
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {organization.name} — comment-triggered DMs across your connected accounts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Its own boundary with no fallback: the label depends on the slow automations fetch,
              and an empty gap that fills in later is better here than either delaying the header
              or reserving space for a skeleton on a secondary piece of text. */}
          <Suspense fallback={null}>
            <DataFreshness organizationId={organization.id} />
          </Suspense>
          <SyncButton organizationId={organization.id} />
        </div>
      </div>

      {/* Three independent boundaries rather than one, because the underlying calls differ by an
          order of magnitude: accounts and members are plain database reads through apps/api
          (~0.2s), while automations fans out to Zernio for live stats and post thumbnails
          (0.4-1.7s measured). Separate boundaries let the cheap sections paint immediately
          instead of waiting on the expensive one.

          Every section fetches only what it needs and re-reads shared data freely - the fetchers
          in dashboard-data.ts are memoized with React cache(), so the accounts call that gates
          all three costs one request, not three. */}
      <Suspense fallback={<StatCardsSkeleton />}>
        <StatsSection organizationId={organization.id} />
      </Suspense>

      <Suspense fallback={<CardSkeleton rows={2} />}>
        <AccountsSection organizationId={organization.id} />
      </Suspense>

      <Suspense fallback={<AutomationsTableSkeleton />}>
        <AutomationsSection organizationId={organization.id} />
      </Suspense>

      <Suspense fallback={<CardSkeleton rows={2} />}>
        <TeamSection organizationId={organization.id} />
      </Suspense>
    </div>
  );
}

/** What a newly registered user sees until an administrator admits them (Phase 15.3,
 * requirement 16).
 *
 * This replaced a redirect to `/onboarding`, where a brand-new user used to invent an
 * organization name and URL slug for themselves. That self-service path is gone: membership in an
 * organization is now the access gate, and only an administrator can grant it
 * (docs/ADR/0007-global-user-roles-and-administration.md).
 *
 * Deliberately a rendered state rather than another redirect. There is nowhere useful to send
 * them - every route behind sign-in needs an organization - and a redirect loop between two empty
 * pages is worse than one page that explains itself. It also deliberately does not say who the
 * administrator is: that would mean exposing the admin list to any user who signs up, and the
 * person in question already knows who runs their tool.
 */
function AwaitingAccess() {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted-bg text-2xl">
        ⏳
      </div>
      <h1 className="mt-4 text-xl font-semibold text-text">Waiting for access</h1>
      <p className="mt-2 text-sm text-text-muted">
        Your account is set up, but it has not been added to an organization yet. An administrator
        needs to grant you access before you can connect an Instagram account or create automations.
      </p>
      <p className="mt-4 text-xs text-text-faint">Already been granted access? Reload this page.</p>
    </div>
  );
}

/** Computes the age of the cached automations data server-side and hands it to the client label.
 *
 * The age is derived here, where both the fetch timestamp and "now" come from the same clock, so
 * what crosses to the browser is a plain number of seconds rather than two timestamps it would
 * have to reconcile. `getAutomationsWithMeta` is the same memoized call the sections below use -
 * the label costs no extra request. */
async function DataFreshness({ organizationId }: { organizationId: string }) {
  const [accounts, automations] = await Promise.all([
    getInstagramAccounts(organizationId),
    getAutomationsWithMeta(organizationId),
  ]);
  // Nothing connected means no Zernio data behind the label, so there is no freshness to report.
  if (accounts.length === 0) {
    return null;
  }

  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - Date.parse(automations.fetchedAt)) / 1000),
  );
  return <DataAge initialAgeSeconds={ageSeconds} />;
}

async function StatsSection({ organizationId }: { organizationId: string }) {
  const [accounts, automations] = await Promise.all([
    getInstagramAccounts(organizationId),
    getAutomations(organizationId),
  ]);
  if (accounts.length === 0) {
    return null;
  }

  const activeCount = automations.filter((a) => a.isActive).length;
  const disabledCount = automations.length - activeCount;
  const totals = sumStats(automations);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        eyebrow="Active automations"
        value={
          <>
            {activeCount}
            <span className="text-base font-semibold text-text-faint"> / {automations.length}</span>
          </>
        }
        sub={disabledCount > 0 ? `${disabledCount} disabled` : 'all enabled'}
      />
      <StatCard
        eyebrow="DMs sent"
        value={totals.hasStats ? totals.dmsSent.toLocaleString() : '—'}
        sub={totals.hasStats ? 'Zernio stats.dmsSent, all-time' : 'stats unavailable right now'}
      />
      <StatCard
        eyebrow="Button clicks"
        value={totals.hasStats ? totals.linkClicks.toLocaleString() : '—'}
        // CTR uses trackedSends, not dmsSent, per Zernio's own spec - a DM with no tracked link
        // can never be clicked, so dmsSent would understate the rate.
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
        value={String(accounts.length)}
        sub={accounts.map((a) => `@${a.username ?? a.zernioAccountId}`).join(', ')}
      />
    </div>
  );
}

/** Renders the connect-Instagram call to action when there is nothing connected yet, and the
 * connected-accounts card otherwise. The empty case is what gates every other section. */
async function AccountsSection({ organizationId }: { organizationId: string }) {
  const accounts = await getInstagramAccounts(organizationId);

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-medium text-text">Connect Instagram</h2>
        <p className="mt-1 text-sm text-text-muted">
          Connect a Business or Creator Instagram account to start creating automations.
        </p>
        <form action={connectInstagramAction} className="mt-3">
          <FormPendingOverlay />
          <input type="hidden" name="organizationId" value={organizationId} />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            Connect Instagram
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-medium text-text">Connected accounts</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-text-muted">
        {accounts.map((account) => (
          <li key={account.id} className="flex items-center justify-between gap-3">
            <span>
              @{account.username ?? account.zernioAccountId} —{' '}
              <span className={account.status === 'CONNECTED' ? 'text-success' : 'text-text-faint'}>
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
  );
}

async function AutomationsSection({ organizationId }: { organizationId: string }) {
  const [accounts, automations] = await Promise.all([
    getInstagramAccounts(organizationId),
    getAutomations(organizationId),
  ]);
  if (accounts.length === 0) {
    return null;
  }
  return <AutomationsBrowser organizationId={organizationId} automations={automations} />;
}

async function TeamSection({ organizationId }: { organizationId: string }) {
  const [accounts, members] = await Promise.all([
    getInstagramAccounts(organizationId),
    getMembers(organizationId),
  ]);
  if (accounts.length === 0) {
    return null;
  }

  return (
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
  );
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
