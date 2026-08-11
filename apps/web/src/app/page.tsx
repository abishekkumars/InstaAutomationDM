import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { OrganizationRole } from '@automationdm/database';
import { ApiError, callApi } from '@/lib/api';
import { connectInstagramAction } from './instagram/actions';

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

interface AutomationListItem {
  id: string;
  zernioPostId: string;
  instagramAccountId: string;
  accountUsername: string | null;
  name: string;
  keywords: string[];
  matchMode: 'CONTAINS' | 'WORD' | 'EXACT';
  isActive: boolean;
}

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

const MATCH_MODE_LABEL: Record<AutomationListItem['matchMode'], string> = {
  CONTAINS: 'contains',
  WORD: 'word',
  EXACT: 'exact',
};

function StatusBanner({ instagram }: { instagram?: string }) {
  if (instagram === 'connected') {
    return (
      <div className="rounded-lg border border-success-border bg-success-bg p-3 text-sm text-success">
        Instagram account connected.
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
              value={`${activeCount} / ${automations.length}`}
            />
            <StatCard eyebrow="Connected accounts" value={String(instagramAccounts.length)} />
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
                  <Link
                    href={`/instagram/posts?accountId=${account.id}`}
                    className="shrink-0 text-accent hover:underline"
                  >
                    View posts →
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <AutomationsTable automations={automations} instagramAccounts={instagramAccounts} />

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

function StatCard({ eyebrow, value }: { eyebrow: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        {eyebrow}
      </div>
      <div className="mt-1.5 text-2xl font-bold text-text">{value}</div>
    </div>
  );
}

function AutomationsTable({
  automations,
  instagramAccounts,
}: {
  automations: AutomationListItem[];
  instagramAccounts: InstagramAccountSummary[];
}) {
  if (automations.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted shadow-sm">
        No automations yet. Open a post from "View posts" above to create one.
      </div>
    );
  }

  const accountsById = new Map(instagramAccounts.map((a) => [a.id, a]));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Table on wider screens */}
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-faint">
            <th className="px-4 py-3">Automation</th>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {automations.map((automation) => (
            <tr
              key={automation.id}
              className="border-b border-border last:border-0 hover:bg-surface-2"
            >
              <td className="px-4 py-3">
                <div className="font-semibold text-text">{automation.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                  <span className="rounded-full bg-muted-bg px-2 py-0.5 font-medium">
                    {MATCH_MODE_LABEL[automation.matchMode]}
                  </span>
                  {automation.keywords.join(', ')}
                </div>
              </td>
              <td className="px-4 py-3 text-text-muted">
                @
                {automation.accountUsername ??
                  accountsById.get(automation.instagramAccountId)?.zernioAccountId}
              </td>
              <td className="px-4 py-3">
                <StatusPill isActive={automation.isActive} />
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/instagram/posts/${automation.zernioPostId}?accountId=${automation.instagramAccountId}`}
                  className="text-accent hover:underline"
                >
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Stacked cards on narrow screens - same data, no sideways scrolling */}
      <ul className="divide-y divide-border md:hidden">
        {automations.map((automation) => (
          <li key={automation.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-text">{automation.name}</div>
                <div className="mt-0.5 text-xs text-text-muted">
                  @
                  {automation.accountUsername ??
                    accountsById.get(automation.instagramAccountId)?.zernioAccountId}
                </div>
              </div>
              <StatusPill isActive={automation.isActive} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
              <span className="rounded-full bg-muted-bg px-2 py-0.5 font-medium">
                {MATCH_MODE_LABEL[automation.matchMode]}
              </span>
              {automation.keywords.join(', ')}
            </div>
            <Link
              href={`/instagram/posts/${automation.zernioPostId}?accountId=${automation.instagramAccountId}`}
              className="mt-2 inline-block text-sm text-accent hover:underline"
            >
              View →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={
        isActive
          ? 'rounded-full border border-success-border bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success'
          : 'rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-semibold text-text-faint'
      }
    >
      {isActive ? 'Enabled' : 'Disabled'}
    </span>
  );
}
