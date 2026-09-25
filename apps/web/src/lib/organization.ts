import { cache } from 'react';
import { cookies } from 'next/headers';
import { pickActiveOrganization } from '@automationdm/shared';
import { getOrganizations, type OrganizationSummary } from '@/app/dashboard-data';

/** Cookie holding the id of the organization the user last switched to (the organization
 * switcher in both view trees). A preference only - see `getActiveOrganization`. */
export const ACTIVE_ORGANIZATION_COOKIE = 'org';

export interface ActiveOrganization {
  /** Every organization the caller belongs to, as apps/api returned them (oldest first). */
  organizations: OrganizationSummary[];
  /** The one being shown, or null when the caller belongs to none (the awaiting-access state). */
  active: OrganizationSummary | null;
}

/** The caller's memberships and which one the app is currently showing.
 *
 * The cookie is never trusted on its own: its id is only honoured if it is in the list apps/api
 * just returned for this caller, so a stale id (membership removed, organization deleted) or a
 * hand-edited one silently falls back to the first membership - which was the only behaviour
 * before the switcher existed. apps/api independently re-checks membership on every
 * `/api/organizations/:id/...` route, so this is presentation, not the tenant boundary.
 *
 * Memoized per request with React's `cache()`, and it reuses `getOrganizations()`'s own
 * memoized call, so the layout, the page and every Suspense section share one round trip.
 * Throws if apps/api is unreachable, exactly as `getOrganizations()` does - callers that must
 * not fail (the root layout) catch it themselves.
 */
export const getActiveOrganization = cache(async (): Promise<ActiveOrganization> => {
  const [organizations, cookieStore] = await Promise.all([getOrganizations(), cookies()]);
  const preferredId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  return { organizations, active: pickActiveOrganization(organizations, preferredId) };
});

/** Just the active organization's id, for routes that only need it to build API paths. */
export async function getActiveOrganizationId(): Promise<string | null> {
  return (await getActiveOrganization()).active?.id ?? null;
}
