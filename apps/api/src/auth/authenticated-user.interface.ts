import type { GlobalUserRole } from '@automationdm/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;

  /** The caller's global application role, read from the `users` table by `SessionGuard` on
   * every request - deliberately NOT carried in the bearer token's own claims.
   *
   * Two reasons, both load-bearing (Phase 15.1, requirement 19). First, a token claim is a
   * snapshot: revoking someone's admin would not take effect until their current token expired,
   * and apps/web mints a fresh token per call, so "expired" is really "until they navigate".
   * Reading the column makes revocation immediate. Second, it keeps authorization decisions
   * anchored to one authority - the database - rather than to whatever apps/web asserted, so a
   * bug (or a forged token, if API_INTERNAL_SECRET ever leaked) cannot escalate a role.
   *
   * See docs/SECURITY.md's "Global user roles" section. */
  role: GlobalUserRole;
}
