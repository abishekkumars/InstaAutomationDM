'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getOrganizations } from '@/app/dashboard-data';
import { ACTIVE_ORGANIZATION_COOKIE } from '@/lib/organization';

// Where a switch may land. Every other signed-in page is scoped to one organization's data (a
// posts list is for one of *its* accounts), so staying on the current URL after switching would
// show a page that belongs to the organization just left. A fixed list, not a caller-supplied
// URL, so this action can never be turned into an open redirect.
const SWITCH_DESTINATIONS = new Set(['/', '/dashboard', '/settings']);

/** Makes another of the caller's organizations the active one (the organization switcher).
 *
 * The submitted id is checked against apps/api's membership list for this caller *before* the
 * cookie is written, so the cookie only ever holds an organization they actually belong to at the
 * time of switching. `getActiveOrganization()` re-validates it on every read anyway, since a
 * membership can be removed after the fact.
 */
export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  const returnTo = formData.get('returnTo');
  const destination =
    typeof returnTo === 'string' && SWITCH_DESTINATIONS.has(returnTo) ? returnTo : '/';

  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    redirect(destination);
  }

  const organizations = await getOrganizations();
  if (!organizations.some((organization) => organization.id === organizationId)) {
    // Not theirs (or no longer theirs): leave the current choice alone rather than erroring.
    redirect(destination);
  }

  (await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // A year: it is a UI preference, and one that falls back safely when it goes stale.
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(destination);
}
