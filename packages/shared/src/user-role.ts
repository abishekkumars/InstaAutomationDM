// Global (application-wide) user roles and the ADMIN_EMAIL bootstrap rule (Phase 15.1).
//
// Deliberately separate from `OrganizationRole` (packages/database): that enum says what a user
// may do *inside one organization*, this one says what they may do in the application as a
// whole. Neither implies the other - an organization OWNER is not an application ADMIN, and an
// ADMIN holds no membership anywhere by virtue of being one. See docs/SECURITY.md.

/** Mirrors the `UserRole` enum in packages/database's Prisma schema as a plain string union.
 *
 * Kept as a union rather than importing the generated Prisma enum so this package stays free of
 * a dependency on `@automationdm/database` (and on Prisma's generated client, which apps/web
 * would then pull into contexts that have no database access) for what is only ever a two-value
 * vocabulary. TypeScript checks assignability wherever the two meet, so they cannot drift
 * apart silently. */
export type GlobalUserRole = 'ADMIN' | 'NORMAL_USER';

/** Whether `email` is the bootstrap administrator named by the `ADMIN_EMAIL` environment
 * variable.
 *
 * Compared trimmed and case-insensitively on both sides: addresses are stored lowercased
 * (docs/DATABASE.md's `User.email`), but `ADMIN_EMAIL` is hand-edited configuration, and a
 * stray capital or trailing space there should not silently cost someone their access.
 *
 * Returns false when `ADMIN_EMAIL` is unset or blank, so an environment that never configures
 * one simply has no bootstrap admin - rather than, say, matching every user whose email is
 * also empty. */
export function isAdminEmail(email: string): boolean {
  const configured = process.env.ADMIN_EMAIL;
  if (!configured || configured.trim().length === 0) {
    return false;
  }
  return configured.trim().toLowerCase() === email.trim().toLowerCase();
}

/** The role a user should hold after signing in or registering, given the role they hold now.
 *
 * `ADMIN_EMAIL` only ever **promotes** - it never demotes, and that asymmetry is the whole
 * point of this function existing rather than the call sites just writing
 * `isAdminEmail(email) ? 'ADMIN' : 'NORMAL_USER'`.
 *
 * Phase 15.2 lets an existing admin grant ADMIN to other people through the Administration UI.
 * If this also demoted anyone who is not `ADMIN_EMAIL`, every one of those grants would be
 * silently revoked the moment that user next signed in - the grant would appear to work, then
 * evaporate. Revoking admin is therefore an explicit action in the Administration UI, never a
 * side effect of signing in.
 *
 * The converse still works as expected: pointing `ADMIN_EMAIL` at a different address does not
 * strip the previous holder, but an admin can now revoke them explicitly, which is the
 * recoverable direction to fail in. */
export function resolveRoleOnSignIn(email: string, currentRole: GlobalUserRole): GlobalUserRole {
  return isAdminEmail(email) ? 'ADMIN' : currentRole;
}
