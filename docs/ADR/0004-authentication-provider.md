# ADR 0004: Authentication provider — Auth.js over Clerk

## Status
Accepted.

## Context

`docs/ARCHITECTURE.md`'s stack table and "Open decisions" section, and
`docs/SECURITY.md`'s AuthN line, have both flagged "Clerk or Auth.js — not yet decided"
since Phase 0. Phase 5's instruction is explicit: compare the two against this project's
open-source/free/self-hosted requirements, recommend one, document it, then implement real
sign-in. `CLAUDE.md`'s stop-and-ask rules are directly relevant here — enabling a paid/
external service or creating an external account is a stop condition, not something to
provision unilaterally.

## Options considered

**A. Clerk.** A hosted, paid third-party auth SaaS. Ships polished sign-in/sign-up UI
components, organization/invite/member-role primitives out of the box (which line up
closely with this project's own `Organization`/`OrganizationMember` model), and session
management handled entirely off-box. The cost of that convenience: it requires creating an
external Clerk account, it is not free at any meaningful production scale (free tier is
capped and the paid tiers bill per monthly active user), it is not self-hostable — user
identity and session data live on Clerk's infrastructure, not this project's own Postgres —
and it requires API keys issued by that external account before a single line of the
integration can be tested. Every one of those is a `CLAUDE.md` stop-and-ask trigger
("Before enabling any paid/external service ... or creating any external account" /
"Credentials of any kind are required from the user") that this phase's instruction did not
grant.

**B. Auth.js (next-auth v5, the current name for what was NextAuth).** Open-source (ISC
license), self-hosted by construction — it runs inside `apps/web`'s own Next.js server
process and reads/writes this project's own Postgres via `packages/database`, so there is no
external account, no third-party data residency, and no usage-based billing at any scale.
It supports both OAuth providers and a `Credentials` provider for hand-rolled email/password
sign-in. Tradeoff: no built-in organization/invite UI (that's on this project to build in
Phase 6 anyway, since `OrganizationMember` is a custom table either provider would need to
learn about) and the npm package is still in a `5.0.0-beta.*` line (currently
`5.0.0-beta.32`) rather than a tagged `5.0.0` stable — it has been in wide production use for
over two years under that beta tag, which is a real risk to note, not one to hide.

## Decision

**Auth.js**, specifically `next-auth@5` with the `Credentials` provider (email + bcrypt-
hashed password), not an OAuth provider. Reasoning for each half of that decision:

**Auth.js over Clerk**: this project's explicit requirement is open-source/free/self-hosted.
Clerk fails all three — external account, paid beyond a capped free tier, identity data
lives off-box. Auth.js satisfies all three: MIT/ISC-licensed source in this repo's own
`node_modules`, zero cost at any scale, and every byte of session/identity data lives in the
Postgres this project already owns (`packages/database`). The org/invite convenience Clerk
would have provided doesn't offset an external paid dependency the project explicitly said
it wants to avoid.

**Credentials provider over an OAuth provider (Google/GitHub/etc.), within Auth.js**: Auth.js
supports both, but wiring an OAuth provider requires registering an OAuth application with
that provider and obtaining a client ID/secret from the user — which is itself a
"credentials required from the user" stop condition per `CLAUDE.md`, and a decision about
*which* OAuth provider(s) to support that hasn't been asked for. A `Credentials` provider
needs no external registration at all: it authenticates against `User.passwordHash` in this
project's own database, using a session-signing secret (`AUTH_SECRET`) generated locally the
same way any other app-internal secret is — comparable to a JWT signing key, not an external
credential. This lets Phase 5 implement real, working sign-in now without a second stop-and-
ask round trip. OAuth providers remain available to add later, as an incremental, opt-in
addition, once/if the user wants to supply a specific provider's client ID/secret — nothing
in this decision forecloses it.

### Why storing a password hash doesn't violate this project's "never store passwords" rule

`docs/DATABASE.md`'s `User` section and `CLAUDE.md`'s hard rules both say passwords are never
stored — but read in context (`docs/SECURITY.md`'s "Instagram passwords are never stored,
never seen — connection is OAuth via Zernio only"), that rule is about **Instagram account
passwords**, which this project must never see because Instagram/Zernio connection is
OAuth-only by hard requirement. It says nothing about this project's *own* user accounts.
`docs/DATABASE.md` additionally flagged, correctly, that *if* a credentials-based flow were
ever chosen for this project's own accounts, "that decision gets its own schema change and
its own security review then, not a placeholder now" — this ADR, the schema change in the
same commit, and the "Security considerations" section below are exactly that review, not a
bypass of it.

## Security considerations

- Passwords are hashed with `bcryptjs` (pure JS, no native build step — matches this
  project's no-native-toolchain-on-this-machine constraint) at cost factor 12 before ever
  touching the database; the plaintext password is never logged, never persisted, and never
  returned in any response body. `User.passwordHash` is never selected into any API/session
  payload — only compared inside the `authorize()` callback.
  Bumping the cost factor is a config change if bcrypt's default gets measured as
  insufficient later; not a schema change.
- Minimum password length (8 characters) is enforced at the Zod schema layer
  (`packages/validation`) before a hash is ever computed — the schema, not the database, is
  the source of truth for password policy, consistent with `docs/SECURITY.md`'s "all
  external input validated with Zod" rule.
- Session strategy is JWT (`session: { strategy: 'jwt' }`), signed with `AUTH_SECRET` (new
  `.env`/`.env.example` variable, generated locally per developer, never committed) —
  chosen over Auth.js's database-session strategy because a `Credentials`-only setup has no
  use for the `Session`/`Account`/`VerificationToken` tables the Prisma adapter would
  otherwise require (those exist to support OAuth token/refresh-token storage, which this
  provider has none of). Auth.js sets its session cookie `httpOnly`, `SameSite=lax`, and
  (in production, once `apps/web` is served over HTTPS) `secure` by default — matching
  `docs/SECURITY.md`'s transport/session rules without any extra configuration.
- `User.authProvider` is set to `"credentials"` and `User.authProviderId` to the user's own
  (lowercased) email at registration time — the closest real analogue this provider has to
  an external "subject" identifier, distinct from the internal `id` every other table's
  foreign keys point at. This finally populates both fields, reserved since Phase 4
  specifically for this moment.
- No NestJS/`apps/api` change is made in this phase. `apps/api` currently exposes no
  endpoint that reads or writes user-owned data — only the infra `/api/health`/`/api/ready`
  checks — so there is nothing yet to guard with a session check. Wiring `apps/api` to
  verify an Auth.js-issued session (shared-secret JWT verification, or a NestJS `auth`
  module/guard) is deferred to whichever phase first adds a real protected API endpoint
  (Phase 6, multi-tenancy), consistent with `docs/ARCHITECTURE.md`'s own stated rule that
  "creating an empty module ahead of the phase that needs it is avoided."

## Consequences

- New runtime dependency in `apps/web`: `next-auth@5.0.0-beta.32` (confirmed peer-compatible
  with `next@^16.0.0` and `react@^19.0.0`, both already in use) and `bcryptjs`.
- New schema field: `User.passwordHash` (nullable — a user created by a future OAuth
  provider would have none), one new migration.
- New env var: `AUTH_SECRET` (documented, never committed, generated locally).
- `apps/web` now depends on `@automationdm/database` directly (previously only `apps/api`
  did) — Auth.js's config and the registration action run entirely server-side inside
  `apps/web`'s own Next.js server process (route handlers / server actions / middleware),
  never in the browser, so this doesn't violate the "database access is server-side only"
  principle `apps/api`'s own `DatabaseModule` was built around; it extends the same
  principle to a second server-side runtime.
- The `next-auth@5` line remaining in beta after two years is a real, ongoing risk —
  tracked here rather than glossed over; revisit if a stable `5.0.0` (or a maintained
  successor) ships before this project needs to touch auth again.

## Alternatives considered
See "Options considered" above — Clerk was the only alternative in scope for this decision
(per the explicit instruction to compare it against Auth.js); no other auth provider was
evaluated.
