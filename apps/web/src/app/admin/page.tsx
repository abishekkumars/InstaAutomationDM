import { Suspense } from 'react';
import { ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/me';
import { CardSkeleton } from '../skeleton';
import { AdminBrowser } from './admin-browser';
import { getAdminOrganizations, getAdminUsers } from './admin-data';

export const metadata = { title: 'Administration - AutomationDM' };

/** The Administration screen (Phase 15.2b, requirement 16).
 *
 * The role check below decides what to *render*; it is not what protects the data. Every
 * `/api/admin/*` route rejects a non-administrator on its own (`AdminGuard`, from a role read
 * out of the database), so a user who guesses this URL sees the panel below and would still get
 * a 403 from every request behind it. Checking here as well means they get an honest
 * explanation instead of a screen full of failed fetches.
 */
export default async function AdminPage() {
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    return (
      <Panel tone="warning" title="Could not check your permissions">
        {error instanceof ApiError ? error.message : 'API not reachable.'}
      </Panel>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <Panel tone="warning" title="Administrator access required">
        This area is limited to administrators. If you need access, ask one of them to grant it to
        you.
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-[26px]">
          Administration
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Admit new users, assign them to an organization, and manage administrators.
        </p>
      </div>

      <Suspense fallback={<CardSkeleton rows={3} />}>
        <AdminSection currentUserId={user.id} />
      </Suspense>
    </div>
  );
}

async function AdminSection({ currentUserId }: { currentUserId: string }) {
  // Both in parallel: neither depends on the other, and the organizations list is only needed to
  // populate the "add to existing" picker.
  const [users, organizations] = await Promise.all([getAdminUsers(), getAdminOrganizations()]);

  return <AdminBrowser users={users} organizations={organizations} currentUserId={currentUserId} />;
}

function Panel({
  tone,
  title,
  children,
}: {
  tone: 'warning';
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
      : '';
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}
