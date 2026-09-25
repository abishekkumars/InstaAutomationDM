// Which of a user's organizations the web app is currently showing (the organization switcher).
//
// The choice is a preference, not an authorization: `preferredId` comes from a cookie the browser
// sends back, so it is only ever used to pick *among the organizations apps/api already says the
// caller belongs to*. A stale or forged id simply falls back to the first membership. apps/api
// still re-checks membership on every `/api/organizations/:id/...` route regardless.

/** The organization to show, given the caller's memberships (in apps/api's order, oldest first)
 * and the id they last switched to. Returns null only when they belong to none. */
export function pickActiveOrganization<T extends { id: string }>(
  organizations: readonly T[],
  preferredId: string | null | undefined,
): T | null {
  if (preferredId) {
    const preferred = organizations.find((organization) => organization.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }
  return organizations[0] ?? null;
}
