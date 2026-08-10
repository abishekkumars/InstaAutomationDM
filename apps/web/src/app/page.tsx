import { redirect } from 'next/navigation';
import type { OrganizationRole } from '@automationdm/database';
import { ApiError, callApi } from '@/lib/api';
import { connectInstagramAction } from './instagram/actions';

const PLACEHOLDER_SECTIONS = ['Automations'];

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

type PrimaryOrganizationResult =
  | {
      status: 'ok';
      organization: OrganizationSummary;
      members: OrganizationMemberSummary[];
      instagramAccounts: InstagramAccountSummary[];
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
    const [members, instagramAccounts] = await Promise.all([
      callApi<OrganizationMemberSummary[]>(`/api/organizations/${organization.id}/members`),
      callApi<InstagramAccountSummary[]>(
        `/api/organizations/${organization.id}/instagram/accounts`,
      ),
    ]);
    return { status: 'ok', organization, members, instagramAccounts };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof ApiError ? error.message : 'API not reachable.',
    };
  }
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

  return (
    <div className="space-y-6">
      {instagram === 'connected' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Instagram account connected.
        </div>
      )}
      {instagram === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not connect your Instagram account. Please try again.
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        {result.status === 'ok' ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-medium">{result.organization.name}</p>
            <p className="text-sm text-slate-500">
              /{result.organization.slug} — you are {result.organization.role.toLowerCase()}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {result.members.map((member) => (
                <li key={member.id}>
                  {member.user.name ?? member.user.email} — {member.role.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
            <p className="font-medium">Could not load your organization</p>
            <p className="mt-1 text-sm">{result.message}</p>
          </div>
        )}
      </div>
      {result.status === 'ok' && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-medium">Instagram</h2>
          {result.instagramAccounts.length === 0 ? (
            <form action={connectInstagramAction} className="mt-2">
              <input type="hidden" name="organizationId" value={result.organization.id} />
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Connect Instagram
              </button>
            </form>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {result.instagramAccounts.map((account) => (
                <li key={account.id}>
                  @{account.username ?? account.zernioAccountId} — {account.status.toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEHOLDER_SECTIONS.map((label) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-medium">{label}</h2>
            <p className="mt-1 text-sm text-slate-500">Coming soon.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
