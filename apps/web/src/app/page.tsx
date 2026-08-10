import { redirect } from 'next/navigation';
import type { OrganizationRole } from '@automationdm/database';
import { ApiError, callApi } from '@/lib/api';

const PLACEHOLDER_SECTIONS = ['Automations', 'Contacts', 'Analytics'];

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

type PrimaryOrganizationResult =
  | { status: 'ok'; organization: OrganizationSummary; members: OrganizationMemberSummary[] }
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
    const members = await callApi<OrganizationMemberSummary[]>(
      `/api/organizations/${organization.id}/members`,
    );
    return { status: 'ok', organization, members };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof ApiError ? error.message : 'API not reachable.',
    };
  }
}

export default async function HomePage() {
  const result = await loadPrimaryOrganization();

  if (result.status === 'none') {
    redirect('/onboarding');
  }

  return (
    <div className="space-y-6">
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
