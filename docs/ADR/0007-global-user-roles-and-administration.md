# ADR 0007 — Global user roles and admin-administered organization membership

- **Status**: Accepted
- **Date**: 2026-08-14
- **Phase**: 15.1 (roles, this ADR's first half) and 15.2 (the Administration surface)
- **Supersedes/amends**: narrows one exclusion in
  `docs/ADR/0005-simplified-mvp-architecture.md` and the matching line in
  `docs/PRODUCT-REQUIREMENTS.md`'s "Explicitly out of scope"

## Context

`docs/PRODUCT-REQUIREMENTS.md` explicitly retired "team roles beyond what Phase 4's
`OrganizationRole` vocabulary already provides", and ADR 0005 retired self-service
multi-tenancy growth in general. A new requirement set contradicts that in two specific ways:

1. There must be an **administrator** who can see every user, grant and revoke that
   administrator status, and decide which organization each user belongs to.
2. A newly registered user must **not** be able to do anything — in particular connect an
   Instagram account — until an administrator has admitted them.

Alongside this came a request to remove the self-service onboarding page, so that signing up
lands directly on the dashboard rather than asking a brand-new user to invent an organization
name and URL slug.

`CLAUDE.md` requires an ADR rather than a silent divergence when a change contradicts an
existing decision, which is why this document exists.

## Decision

### 1. A second, independent role axis

Add a `UserRole` enum (`ADMIN` | `NORMAL_USER`) and a `users.role` column, **in addition to**
the existing per-organization `OrganizationRole`. The two are orthogonal:

- `OrganizationRole` answers *"what may this user do inside this organization?"*
- `UserRole` answers *"may this user administer the application itself?"*

Neither implies the other. An organization `OWNER` is not an application `ADMIN`; an
application `ADMIN` gets no data access anywhere by virtue of being one. **Tenant isolation is
unchanged** — every rule in `docs/SECURITY.md`'s "Tenant isolation" section still binds
administrators exactly as before. An admin who needs to see an organization's automations
takes a membership in it, through the same `organization_members` table as everyone else.

We considered instead overloading `OrganizationRole` with a `SUPERADMIN` value, and rejected
it: that enum is scoped to a row in a join table, so "an admin with no organization" would
have nowhere to live, and every existing membership query would have to learn about a value
that means "ignore the organization this row points at".

### 2. Organization membership *is* the access gate

Rather than a separate `canConnectInstagram` permission flag, a user's **membership in an
organization** is what admits them. A user with no membership sees an "awaiting access" empty
state and can connect nothing; an administrator assigning them to an organization is what
grants access.

This collapses two requirements into one mechanism, and it falls out of the existing design
rather than being bolted onto it: every tenant-owned query already resolves its
`organization_id` through `organization_members`, so a user with no membership already reaches
no data. Nothing new has to be enforced — the gate is the isolation rule that was already
there.

A distinct per-user permission flag remains a small, additive change if a future requirement
needs "may use the dashboard, but may not connect new accounts" as separate states. Nothing
here forecloses it.

### 3. Onboarding moves to the administrator, and organizations keep their slug

Self-service organization creation (`/onboarding`) is removed. Organizations are created and
assigned by an administrator in the Administration surface, and `Organization.slug` is
**retained**, chosen by the administrator, and defaulted to the new user's email local-part
(`john@example.com` → `john`, or `john-2` where taken).

This last detail resolves what would otherwise have been a tenant-isolation defect. The
requirement as originally stated was that the Zernio profile name be the email local-part —
but `ZernioInstagramProvider.ensureProfile` looks a profile up by exact name and **reuses the
match**, and local-parts are not unique (`john@gmail.com` and `john@company.com` both yield
`john`). Two organizations would then share one Zernio profile, and the second would adopt the
first's connected Instagram account. Defaulting the *slug* instead means the uniqueness
guarantee comes from the existing `organizations.slug` unique constraint, the profile name
continues to derive from the slug exactly as it does today, and `ensureProfile` needs no
change at all.

### 4. The role is read from the database, never from a token or a request

`SessionGuard` resolves `role` (and `email`) from the `users` row on every request. The role
is never carried in the `apps/web` → `apps/api` bearer token, never copied into the Auth.js
session, and never read from a request body or query string. `ADMIN_EMAIL` bootstraps the
first administrator and only ever promotes, never demotes.

The full rule set, and why each rule is the way it is, lives in `docs/SECURITY.md`'s "Global
user roles" section rather than being duplicated here.

## Consequences

**Good**

- One mechanism (membership) gates access, instead of a permission system parallel to the
  isolation rules that already exist.
- Revoking an administrator takes effect on their next request, not at token expiry.
- Requirement 20 ("always create a user as a normal user in the backend, don't pass it through
  the API") holds at three independent layers: the Zod schema has no `role` field, the
  registration path derives it server-side, and the column defaults to `NORMAL_USER`.
- The schema change is purely additive — one nullable-free column with a default. No data
  migration, nothing destructive, safe to deploy against live data.
- The Zernio profile-naming defect described above is avoided rather than shipped.

**Bad / accepted costs**

- One indexed primary-key read is added to every authenticated API request. At this project's
  volume (<1,000 API calls/month) that is not a meaningful cost, and it buys immediate
  revocation. Revisit only if request volume changes by orders of magnitude.
- Two role vocabularies now exist, which is a genuine ongoing source of confusion. Mitigated by
  naming (`UserRole` vs `OrganizationRole`, `NORMAL_USER` rather than `MEMBER` so no value name
  is shared between them) and by the comparison table in `docs/SECURITY.md`.
- A new user is fully blocked until an administrator acts. For a ~3-4 user internal tool this
  is the intent, not a cost; it would be unacceptable in a self-service product.
- `docs/PRODUCT-REQUIREMENTS.md`'s out-of-scope list is now narrower. It is amended in place
  rather than left to contradict this ADR.

## Alternatives rejected

- **Remove the `Organization` table entirely and make `User` the tenant.** Genuinely
  considered, and initially chosen, before being reversed in favour of this design. It would
  have re-keyed `instagram_accounts` and `automations`, deleted `organization_members`, moved
  `zernio_profile_id` onto `users`, rewritten every API route to drop its
  `/organizations/:organizationId` segment, and required a destructive, irreversible migration
  of live data. It would also have made it impossible for two people to manage one Instagram
  account. The Administration surface delivers the same user-visible outcome — no onboarding,
  no slug to invent — for a fraction of the work and none of the risk.
- **A `SUPERADMIN` value on `OrganizationRole`.** See §1.
- **A separate `canConnectInstagram` flag.** See §2.
- **Carrying the role as a token claim** to avoid the per-request read. Rejected: it makes
  revocation lag, and it moves an authorization decision out of the database and into whatever
  `apps/web` asserted.
