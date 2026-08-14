# Security

Status: Phase 8, scope simplified per
`docs/ADR/0005-simplified-mvp-architecture.md`. Expanded and re-verified in Phase 13
(Security hardening, scaled to this app's actual size — ~3-4 users), but these rules apply
from the very first line of code, not just at the end.

## Secrets

- Never hardcoded, never committed. All secrets via environment variables, documented
  (name + purpose, not value) in `.env.example`.
- Never logged: API keys, OAuth secrets, access/refresh tokens, passwords. Structured
  logging must redact these fields by name (`apiKey`, `accessToken`, `refreshToken`,
  `password`, `secret`, `*Secret`, `*Token`) at the logger transport level, not by
  remembering to omit them at every call site.
- Zernio API key and webhook secret are used only inside `packages/zernio` /
  `apps/api`'s webhooks module — never sent to `apps/web`, never returned in any API
  response body.
- Instagram passwords are never stored, never seen — connection is OAuth via Zernio; we
  only ever hold Zernio-issued account identifiers/tokens server-side.

## Tenant isolation

See `docs/DATABASE.md` and `docs/ARCHITECTURE.md`. `organization_id` is always derived from
the authenticated session's membership, never trusted from client input (path param, body,
or query string). Covered by explicit cross-tenant tests, not just review — first proven in
`apps/api/src/organizations/__tests__/organizations.e2e.test.ts` (Phase 6): a real,
authenticated, non-member user requesting another organization's member list gets a plain
`404`, and the test asserts the response body contains none of that organization's data, not
just that the status code is right. `apps/api/src/instagram/__tests__/instagram.e2e.test.ts`
(Phase 8) extends the same pattern to the Instagram connect/callback/list endpoints.

**A second, Phase-8-specific trust boundary**: the Instagram OAuth callback carries
`profileId`/`accountId` as query params on a URL the *end user's own browser* follows — even
though Zernio produced those values, they arrive to us via a channel we don't fully control.
`InstagramService.handleCallback` treats them as claims to verify, not facts to trust: the
`profileId` must match the calling organization's own `Organization.zernioProfileId`, and
the `accountId` is independently re-confirmed with a live `GET /v1/accounts` call to Zernio
before anything is written. See `docs/ARCHITECTURE.md`'s "Instagram connect flow" section.

## AuthN/AuthZ

- AuthN: Auth.js (`next-auth@5`), `Credentials` provider — email + password, hashed with
  `bcryptjs` (cost factor 12) before it ever touches the database; the plaintext password is
  never logged, persisted, or returned in any response. Runs entirely server-side inside
  `apps/web`; session is a signed JWT (`AUTH_SECRET`, local-only env var, never committed).
  Chosen over Clerk (paid, external account, not self-hosted) and over wiring an OAuth
  provider (would require external app registration + credentials from the user before this
  phase could proceed) — full reasoning in `docs/ADR/0004-authentication-provider.md`. This
  is specifically about *this project's own* user accounts — unrelated to, and does not
  change, the Instagram-password rule below.
- **Google sign-in (Phase 15.5)**, alongside the credentials provider rather than replacing
  it. Three properties matter here:
  - **Fails closed on partial config.** The provider is registered only when *both*
    `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, and the button is hidden on the
    same condition. Auth.js throws at import time on a provider missing its credentials,
    which would take down `src/auth.ts` entirely — including password sign-in. A missing
    config therefore costs a hidden button, not a broken sign-in page.
  - **Unverified Google emails are refused.** Accounts are linked by email address, so
    accepting an unverified one is the single path by which someone could sign in as an
    existing user by registering a Google account claiming their address. Google sets
    `email_verified` itself; this only declines to ignore it.
  - **The session carries our own `User.id`, not Google's subject id.** Auth.js hands the
    `signIn` callback Google's `sub`; that callback overwrites `user.id` with the row's own
    primary key before the JWT is minted. Without it every subsequent `apps/api` call would
    resolve to a user that does not exist. Linking never overwrites an existing account's
    `passwordHash` or its `authProvider`, so an account created by email/password keeps
    working both ways.
- **Session lifetime (Phase 15.6)**: a rolling **30-minute idle timeout**
  (`session.maxAge`, with `updateAge` at 5 minutes). Because the strategy is JWT, `maxAge` is
  the token's own lifetime and Auth.js re-issues the cookie as the session is used — so this
  is "30 minutes of genuine inactivity", not "signed out 30 minutes after signing in".
  `SessionExpiryWatcher` (`apps/web/src/app/session-expiry-watcher.tsx`) polls
  `/api/auth/session` and shows a blocking notice when it lapses, so an expired session is
  visible before the user loses work to a failed submission. It treats **only** a successful
  response carrying no user as expiry — a 5xx or a dropped connection is ignored, since a
  spurious "you have been signed out" teaches people to dismiss the real one.
- **`apps/api` session verification (Phase 6)**: `apps/api` never sees Auth.js's own session
  cookie. Instead, `apps/web` mints a short-lived (60s), purpose-built bearer token
  (`packages/shared/src/internal-service-token.ts`, HS256) immediately after checking the
  caller's session, signed with `API_INTERNAL_SECRET` — a **separate** secret from
  `AUTH_SECRET` (never reuse one key across two different cryptographic uses/protocols).
  `apps/api`'s `SessionGuard` verifies it and populates `request.user`; every service method
  re-derives `organizationId` from that user's real `OrganizationMember` rows, never from a
  path/body parameter. Full design + why not just decode the Auth.js cookie directly:
  `docs/ARCHITECTURE.md`'s "Session verification (Phase 6)" section.
- AuthZ: role-based within an organization (owner/admin/member — vocabulary exists since
  Phase 4's `OrganizationRole` enum). `SessionGuard` + per-request membership lookups are the
  Phase 6 foundation. Permission checks *within* an organization beyond "is a member" (e.g.
  only an `OWNER` may do X) still do not exist, and still nothing needs them: the
  `organizations` module became **read-only** in Phase 15.3, and every tenant-owned mutation
  elsewhere is authorized by membership alone. Membership is also now the access gate itself
  (requirement 16) — a user with none reaches no tenant data at all.
  - Distinct from the **global** `UserRole` added in Phase 15.1, which governs the
    Administration surface and nothing else. See "Global user roles" immediately below; the two
    are orthogonal and neither implies the other.

## Global user roles

Added in Phase 15.1 — see `docs/ADR/0007-global-user-roles-and-administration.md`. This is a
**second, independent** role axis, and the distinction matters:

| | `OrganizationRole` (Phase 4) | `UserRole` (Phase 15.1) |
|---|---|---|
| Scope | One organization | The whole application |
| Values | `OWNER` / `ADMIN` / `MEMBER` | `ADMIN` / `NORMAL_USER` |
| Stored on | `organization_members.role` | `users.role` |
| Answers | "what may they do inside this org?" | "may they administer the application?" |

Neither implies the other. An organization `OWNER` is not an application `ADMIN`, and an
application `ADMIN` holds no membership anywhere by virtue of being one — if an admin needs to
see an organization's data, they get a membership like anyone else. Tenant isolation is
therefore **unchanged** by this feature: the "Tenant isolation" rules above still bind admins.

Four rules govern how the global role is read and written. All four have tests
(`apps/api/src/auth/__tests__/session-guard.e2e.test.ts`,
`packages/shared/src/__tests__/user-role.test.ts`):

1. **Resolved from the database on every request, never from the token.** `SessionGuard` reads
   `users.role` by the token's `sub` on each call. A role claim smuggled into an otherwise
   valid bearer token is ignored — `verifyInternalServiceToken` reconstructs its payload from
   `sub`/`email` only, so extra claims cannot reach `request.user`. The cost is one indexed
   primary-key read per request, which at this project's volume (<1,000 calls/month) is
   irrelevant next to the property it buys: **revocation takes effect immediately** rather than
   whenever the current token expires.
2. **Never accepted from client input.** No endpoint reads a role from a request body, query
   string, or path. Registration derives it server-side; `credentialsSchema` has no `role`
   field, so a `{"email":…,"password":…,"role":"ADMIN"}` payload cannot reach the create call
   at all. The column's `@default(NORMAL_USER)` backstops this at the schema level: an insert
   that says nothing about `role` cannot accidentally produce an admin.
3. **`ADMIN_EMAIL` bootstraps, and only ever promotes.** The account named by that environment
   variable is promoted at registration and re-promoted on each subsequent sign-in — *after*
   the password check, so an unauthenticated caller cannot provoke a write by guessing the
   address. It never demotes: admins granted through the Administration UI are not named in
   `ADMIN_EMAIL`, and recomputing roles from it alone would silently revoke them at their next
   sign-in. Revoking admin is an explicit action instead. See
   `packages/shared/src/user-role.ts`.
4. **Not copied into the Auth.js session or JWT.** `apps/web` deliberately does not carry the
   role in its session — a copy there would be a second, staler authority for an authorization
   decision. `apps/web` asks `GET /api/me` when it needs to know (e.g. whether to render the
   Administration nav item), and any check that actually *gates* something happens in
   `apps/api`.

### Enforcement (Phase 15.2)

`AdminGuard` (`apps/api/src/auth/admin.guard.ts`) protects every `/api/admin/*` route, declared
as `@UseGuards(SessionGuard, AdminGuard)` — order matters, since the first populates the role
the second reads. It returns `403`, not the `404` used for tenant-owned resources, because the
existence of the admin routes is not itself sensitive.

Hiding the Administration nav item from non-admins in `apps/web` is **presentation only**.
Every admin route rejects a `NORMAL_USER` regardless of what the browser chose to render, and
there is a test asserting exactly that for each one — hiding a link has never been access
control, and this codebase does not treat it as such.

**Administrator is not a data-access role.** `AdminService` reads users, organizations, and
memberships, and nothing else — never automations, Instagram accounts, or posts. The "Tenant
isolation" rules above bind administrators exactly as they bind everyone else; an admin who
needs an organization's data takes a membership in it. Being able to *grant* access is
deliberately separate from *having* it.

One availability rule sits here rather than in the isolation section, because it protects
against self-inflicted loss rather than an attacker: revoking the **last remaining**
administrator is refused with a `409`. Self-demotion is allowed while another admin exists;
being the last one is what is blocked. Without this, the final administrator could lock the
entire surface away with no path back short of a manual database edit.

## Webhooks

- Signature verification mandatory once `ZERNIO_WEBHOOK_SECRET` is set (see
  `docs/WEBHOOKS.md`), timing-safe comparison.
- Idempotent processing via the `webhook_events` unique constraint.

## Input validation

- All external input (API request bodies, webhook payloads) validated with Zod schemas
  from `packages/validation` before touching business logic.
- API rate limiting at the NestJS layer (per-org and per-IP) — exact limits set once we
  have real Zernio rate-limit numbers (Phase 8-11, whichever first makes real Zernio calls)
  and real usage patterns. Low priority at this project's actual call volume (<1,000/month).

## Transport/session security

- HTTPS everywhere in any deployed environment — whatever TLS termination the actual host
  provides (no specific reverse proxy/CDN required, see `docs/DEPLOYMENT.md` and
  `docs/ADR/0005-simplified-mvp-architecture.md`).
- Secure, `httpOnly`, `SameSite` cookies for session state.
- CSRF protection on any state-changing endpoint reachable from a browser session cookie.
- CORS restricted to known frontend origins (no wildcard) once `apps/web`'s deployed origin
  is known.
- Standard security headers (CSP, `X-Content-Type-Options`, `X-Frame-Options`/frame-ancestors,
  HSTS in production) via NestJS middleware (e.g. `helmet`).

## Audit logging

No dedicated `audit_logs` table — retired per
`docs/ADR/0005-simplified-mvp-architecture.md` along with the rest of the CRM/billing scope
it was originally paired with. At this project's scale (~3-4 users), structured server logs
(already correlated by `requestId`, see "Error responses" below) are the audit trail for
now; revisit with a real table only if a concrete compliance/traceability requirement
appears.

## Error responses

Never leak stack traces, internal file paths, SQL, or library versions to API responses in
production. A generic error shape + a server-side correlation id (`requestId`) that maps to
the detailed structured log entry.

## Dependency hygiene

`npm audit`/equivalent run in CI (Phase 1 CI setup) on every PR; no direct commits that
introduce a dependency with a known critical CVE without a documented reason.

## This is a living document

Every phase that touches auth, webhooks, or tenant data should re-read this file first and
extend it if a new consideration comes up — not treat it as fixed at Phase 0.
