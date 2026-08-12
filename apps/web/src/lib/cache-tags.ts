/** Cache tag names, in one place.
 *
 * Every cached read tags itself with one of these, and every mutation invalidates the same one.
 * They live together because a typo in either half fails silently and in opposite directions: a
 * mistyped read tag is simply never invalidated (stale forever until the TTL), and a mistyped
 * invalidation tag clears nothing (the user's own edit appears to vanish). Neither throws.
 */
export const cacheTags = {
  /** The org-wide automations list, including its live Zernio stats and post previews. */
  automations: (organizationId: string) => `org:${organizationId}:automations`,
  accounts: (organizationId: string) => `org:${organizationId}:accounts`,
  members: (organizationId: string) => `org:${organizationId}:members`,
  /** One connected account's synced posts. */
  posts: (instagramAccountId: string) => `acct:${instagramAccountId}:posts`,
} as const;

/** Everything a change to an automation can affect. Used by create/update/delete and by Sync.
 *
 * Includes `accounts` even though editing an automation cannot change an account: the dashboard's
 * stat row renders account counts and automation stats from the same render pass, so refreshing
 * one while leaving the other stale produces a visibly inconsistent header. Over-invalidating
 * four cheap entries is better than showing mismatched numbers.
 */
export function automationTags(organizationId: string): string[] {
  return [
    cacheTags.automations(organizationId),
    cacheTags.accounts(organizationId),
    cacheTags.members(organizationId),
  ];
}
