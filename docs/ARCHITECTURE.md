# Architecture

Status: Phase 10.2 baseline, **scope simplified** — see
`docs/ADR/0005-simplified-mvp-architecture.md`. This project is a small internal/limited-use
tool (~3-4 users, under 1,000 API calls/month), not a general-purpose SaaS; the architecture
below reflects that directly rather than carrying infrastructure sized for a scale this
product doesn't operate at. It will be revisited via ADRs (`docs/ADR/`) if reality forces a
change, not edited silently.

## Guiding constraint

Modular monolith, not microservices, from day one:

```
Next.js (apps/web) -> NestJS (apps/api) -> PostgreSQL/Prisma (packages/database) -> Zernio
```

`apps/api` is internally organized into modules with clear boundaries, so that any module
*could* be extracted into its own service later without a rewrite — but none is extracted
until there's a real operational reason to, and per ADR 0005 no such reason exists yet.
**Not introduced unless a concrete requirement appears later**: Redis, BullMQ, a second
runtime process for queue consumers, object storage (S3/R2), Nginx, Docker, microservices,
an event bus, a complex analytics pipeline, a CRM, billing, or a general trigger/condition/
action workflow engine.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Server Components/Actions call `apps/api` directly server-side — no client-side data-fetching library needed yet |
| Backend | NestJS + TypeScript, REST | Modular DI container maps directly onto the module list below |
| Database | PostgreSQL + Prisma | Relational data (orgs, accounts, automations) with strong migration story |
| External integration | Zernio API (Instagram via Meta Graph API under the hood) | See `docs/ZERNIO-INTEGRATION.md` |
| Auth | Auth.js (`next-auth` v5), `Credentials` provider | Open-source, free, self-hosted — see `docs/ADR/0004-authentication-provider.md` |
| Infra | Whatever the actual deploy target provides | No Docker/Nginx/Cloudflare requirement at this scale — see `docs/DEPLOYMENT.md` and ADR 0005 |

**Not part of the stack** (see ADR 0005 for why): Redis, BullMQ, S3/R2 or any object
storage, React Flow/a workflow builder, TanStack Query, WebSockets.

## Repository layout

```
apps/
  web/      Next.js frontend
  api/      NestJS HTTP API
  worker/   inert placeholder (Phase 2) - no queue, not wired to anything - see ADR 0005
packages/
  database/            Prisma schema + generated client
  shared/               cross-cutting types/utilities (e.g. the internal service token)
  validation/           Zod schemas (form + webhook validation)
  zernio/                InstagramProvider + ZernioInstagramProvider (real, Phase 8 - account connection)
  automation-engine/     comment-automation matching (simplified shape, see docs/AUTOMATION-ENGINE.md)
docs/        all artifacts described in the master prompt
scripts/     PowerShell dev scripts (project-local tooling only)
```

`packages/automation-engine` and `packages/zernio` are deliberately separate from
`apps/api` so automation matching can be unit tested with no NestJS or database
dependency, and so Zernio is never called directly from anywhere except `packages/zernio`.

`infra/docker/`, `infra/nginx/`, and the root `docker-compose.yml` exist as unused
placeholders from Phase 0 (written before this project's actual scale was known) — not part
of the current plan per ADR 0005, kept for now to avoid unrelated churn rather than
removed as part of a documentation-only change; worth deleting in a future cleanup pass.

## Application shells (Phase 2)

`apps/web`, `apps/api`, and `apps/worker` were scaffolded as minimal, featureless shells.
Real versions installed (pnpm-resolved, not hand-picked):

| App | Framework | Key versions |
|---|---|---|
| `apps/web` | Next.js, App Router | Next.js `16.3.0`, React `19.2.8`, Tailwind CSS `4.3.3` |
| `apps/api` | NestJS | `@nestjs/core`/`common`/`platform-express` `11.1.29`, `@nestjs/config` `4.0.4` |
| `apps/worker` | plain TypeScript (no framework yet) | `tsx 4.23` for dev-mode watch |

- **`apps/web`**: a responsive shell (mobile-first Tailwind utility classes, a header/main/
  footer layout, `viewport` metadata). No `eslint-config-next` — it reuses the repo's single
  shared `eslint.config.mjs`.
- **`apps/api`**: global `/api` prefix, `ConfigModule` with a hand-written `validateEnv`, a
  request-id middleware (`X-Request-Id`), a global exception filter producing the
  `{ error: { code, message, requestId } }` shape from `docs/API-SPEC.md`, `GET /api/health`
  and (Phase 4) `GET /api/ready`.
- **`apps/worker`**: bootstrap only — process startup logging and `SIGINT`/`SIGTERM`
  handling, kept alive via `process.stdin.resume()`. **Stays inert per ADR 0005** — no
  queue connection, no processors; kept in the repo only to avoid the churn of deleting a
  directory that costs nothing to leave alone.

## Database (Phase 4, extended Phase 7/8)

`packages/database` owns the Prisma schema, migrations, generated client, and a singleton
`PrismaClient` (`src/client.ts`) — nothing outside this package imports `@prisma/client`
directly. `apps/api` depends on it via the pnpm workspace protocol
(`"@automationdm/database": "workspace:*"`) and wraps the singleton in a NestJS
`DatabaseModule`/`PrismaService` (`apps/api/src/database/`) for lifecycle management
(connect on `OnModuleInit`, disconnect on `OnModuleDestroy` + `app.enableShutdownHooks()`).

```
apps/api (NestJS)
   |  DatabaseModule -> PrismaService
   v
packages/database (Prisma schema, migrations, client singleton)
   v
PostgreSQL
```

`GET /api/ready` runs `SELECT 1` through `PrismaService` and returns `503` if it fails.

Local Postgres runs project-locally with no admin rights and no Docker, via the
`embedded-postgres` npm package wrapping the official Postgres binaries, controlled through
direct `pg_ctl` calls (`scripts/db.ps1` / `packages/database/dev/local-db.mjs`) — see
`docs/ADR/0003-local-postgresql-strategy.md`.

Per ADR 0005, Postgres stores `users`, `organizations`, `organization_members`,
`instagram_accounts` (real as of Phase 7), `automations`, automation run/status rows, and
`webhook_events` — and nothing else. Instagram posts/reels are **not** duplicated here;
they're read live from Zernio. Full schema/conventions: `docs/DATABASE.md`.

## Backend modules (apps/api)

`auth` (a `SessionGuard`, not a login flow — Auth.js itself lives in `apps/web`),
`organizations` (folds in `users`/`members` for now — no invite-by-email flow yet to justify
splitting them out), `instagram` (Phase 8 — real: OAuth connect/callback endpoints + a
`packages/zernio` DI binding, mounted under `organizations/:organizationId/instagram` rather
than as a separate top-level `zernio` wrapper module, since it has nothing to do yet beyond
what `instagram.module.ts` already provides; Phase 9 added posts/reels listing to the same
module rather than a separate `posts` module, since it's still entirely about one connected
Instagram account), `automations` (Phase 10 — real: comment-automation creation, mounted
under `organizations/:organizationId/instagram/accounts/:accountId/posts/:postId/automations`;
imports `InstagramModule` to reuse its `INSTAGRAM_PROVIDER` binding rather than creating a
second `ZernioInstagramProvider` instance; Phase 10.1 added a second controller,
`OrganizationAutomationsController`, in the same module for the org-wide
`organizations/:organizationId/automations` list the redesigned dashboard needed — a separate
class rather than a second method on `AutomationsController` since the route has no
`accountId`/`postId` segment), `webhooks` (Phase 11), `health`.

Not all of these exist yet — see `docs/IMPLEMENTATION-ROADMAP.md` for which phase introduces
which module. Creating an empty module ahead of the phase that needs it is avoided;
premature scaffolding is itself a form of uncontrolled change. Per ADR 0005, there is no
`contacts`, `conversations`, `messages`, `analytics`, `usage`, `billing`, `notifications`, or
`audit` module planned — that scope is retired, not deferred-but-still-coming.

## Request flow

```
Browser → Next.js (apps/web)
             │  server-side calls, signed internal bearer token (see below)
             ▼
      NestJS API (apps/api)
             │
    ┌────────┴────────┐
    ▼                 ▼
PostgreSQL      packages/zernio
(source of           │
 truth)               ▼
               Zernio API → Instagram
```

## Webhook flow (Phase 11, simplified per ADR 0005)

```
Instagram → Zernio → Zernio webhook → POST /webhooks/zernio (apps/api, webhooks module)
                                          │
                                          ▼
                              1. Validate signature (X-Zernio-Signature, HMAC-SHA256)
                              2. Validate payload schema (packages/validation)
                              3. Persist raw event to webhook_events (idempotency key = event id)
                              4. If duplicate event id → 200 OK, no further action
                              5. Resolve org -> resolve IG account -> find the matching
                                 automation (specific post/reel + keyword) -> execute its
                                 actions (public reply + DM via packages/zernio) - in-process,
                                 same request, no queue (ADR 0005)
                              6. Record the run's outcome (docs/AUTOMATION-ENGINE.md)
                              7. Return HTTP 200
```

Whether Zernio's own `comment-automations` API already does the keyword-matching and
action-execution server-side (in which case this handler mostly just records the outcome it
reports) or whether this handler must do the matching itself is **not decided** — verify
against Zernio's real docs during Phase 10/11 implementation (`docs/ZERNIO-INTEGRATION.md`,
`docs/AUTOMATION-ENGINE.md`) rather than assuming either way now.

The handler stays fast regardless: never more than the DB insert plus the small, bounded
number of Zernio REST calls one automation's actions require — no unbounded loops, no
fan-out, no queue needed at this call volume (<1,000/month total).

## Multi-tenancy (Phase 6)

```
User → Organization → Instagram Account → Automations
```

Every tenant-owned table carries `organization_id`. `organization_id` is **never** taken
from client-supplied input — the service layer resolves it from the authenticated
session/membership on every request. Tenant isolation is covered by dedicated tests (see
`docs/TESTING.md`), not just code review — `apps/api/src/organizations/organizations.service.ts`
is the first real example: `listMembers` looks up the caller's own membership row for the
requested org *before* returning anything about it, and returns a plain `404` (not `403`) for
a real org the caller isn't in, so a non-member can't even confirm the org exists.

**Organization creation is administrator-only as of Phase 15.2/15.3.** It lives behind
`POST /api/admin/organizations`, guarded by `SessionGuard` + `AdminGuard`. The
`organizations` module is now read-only (`GET /api/organizations`, `GET /api/organizations/
:id/members`).

The self-service path that used to exist — `POST /api/organizations` plus an
`apps/web/src/app/onboarding/` step every new sign-up was redirected to — has been removed
outright. It was correct while onboarding was the way in, and became a hole the moment
organization membership became the access gate (requirement 16): a user waiting to be admitted
could simply create an organization and admit themselves. See
`docs/ADR/0007-global-user-roles-and-administration.md`.

What a new sign-up sees instead: `apps/web/src/app/page.tsx` still checks the caller's live
organization count (in the page, not `proxy.ts`, since it needs a real count rather than just
"is there a session"), but now *renders* an "awaiting access" state rather than redirecting.
There is nowhere useful to redirect to — every route behind sign-in needs an organization — so
a rendered explanation beats a loop between two empty pages.

### Global roles (Phase 15.1)

A second, independent role axis sits alongside `OrganizationRole`: `users.role`
(`ADMIN` | `NORMAL_USER`), which governs access to the Administration surface and nothing
else. Neither role implies the other, and **being an administrator grants no tenant data
access** — `AdminService` reads users, organizations and memberships only. The tenant
isolation rules above bind admins exactly as they bind everyone else.

`SessionGuard` resolves that role from the `users` table on every request rather than reading
it from the bearer token, so revoking an administrator takes effect on their next request
instead of at token expiry. Full rules: `docs/SECURITY.md`'s "Global user roles" section.

## Instagram connect flow (Phase 8)

```
apps/web (Connect Instagram button, server action)
   │  POST /api/organizations/:id/instagram/connect
   ▼
apps/api InstagramService
   │  ensureProfile (once per org, persists Organization.zernioProfileId)
   │  getConnectUrl(zernioProfileId, redirect_url=APP_URL/instagram/callback?organizationId=:id)
   ▼
Zernio (hosts the entire OAuth round trip with Instagram/Meta)
   │  browser redirect back to redirect_url with
   │  connected=instagram&profileId=X&accountId=Y&username=Z appended
   ▼
apps/web /instagram/callback (still behind the normal authenticated-session requirement)
   │  POST /api/organizations/:id/instagram/callback { profileId, accountId }
   ▼
apps/api InstagramService.handleCallback
   │  1. re-check caller's membership in :id (never trust the URL alone)
   │  2. profileId must match Organization.zernioProfileId
   │  3. findConnectedAccount(profileId) - a LIVE Zernio call, not the redirect's own
   │     query params - must independently confirm the same accountId
   │  4. upsert InstagramAccount, reject (409) if that accountId already belongs to a
   │     different organization
   ▼
PostgreSQL (instagram_accounts)
```

See `docs/ZERNIO-INTEGRATION.md`'s "Account connection" section for why step 3 exists (never
trust a value that arrived via the end user's own browser, even one Zernio itself produced)
and why there's no OAuth authorization code for us to exchange - Zernio hosts that whole
round trip itself.

## Listing Instagram posts/reels (Phase 9)

```
apps/web (Posts list / detail pages, Server Components)
   │  GET /api/organizations/:id/instagram/accounts/:accountId/posts[?page&limit]
   │  GET /api/organizations/:id/instagram/accounts/:accountId/posts/:postId
   ▼
apps/api InstagramService
   │  1. re-check caller's membership in :id, and that :accountId belongs to it
   │     (both 404-not-403, same pattern as every other resource in this module)
   │  2. InstagramProvider.listPosts / getPost
   ▼
ZernioInstagramProvider
   │  GET /v1/posts?profileId&accountId&platform=instagram&source=external&page&limit
   ▼
Zernio (synced Instagram posts/reels, up to ~12 months of history)
```

Nothing here writes to PostgreSQL — per `docs/ADR/0005-simplified-mvp-architecture.md`,
posts/reels are proxied live from Zernio on every request, never duplicated locally.
`getPost` has no direct single-post Zernio endpoint available to it for this project's
use case (see `docs/ZERNIO-INTEGRATION.md`'s "Listing posts/reels" section for why) - it
searches a `listPosts` call instead, which is why it takes the same `zernioProfileId`/
`zernioAccountId` input `listPosts` does rather than just a bare post id.

## Comment automation creation (Phase 10)

```
apps/web (create-automation form on a post's detail page, server action)
   │  POST /api/organizations/:id/instagram/accounts/:accountId/posts/:postId/automations
   │    { name, keywords: string[], matchMode, commentReply?, dmMessage }
   ▼
apps/api AutomationsService
   │  1. re-check caller's membership in :id, and that :accountId belongs to it
   │  2. local pre-check: does an Automation already exist for (accountId, postId)?
   │  3. InstagramProvider.createCommentAutomation
   ▼
ZernioInstagramProvider
   │  POST /v1/comment-automations { profileId, accountId, platformPostId, name,
   │    keywords, matchMode, commentReply, dmMessage }
   ▼
Zernio (creates the automation AND will execute it server-side - see below)
   │
   ▼
PostgreSQL (automations - mirrors the created config, keyed by Zernio's own automationId)
```

**Resolved during this phase, not assumed**: Zernio's own `POST /v1/comment-automations`
executes the entire keyword-match → public-reply → DM flow server-side once created - this
project's code never re-implements that matching (`docs/AUTOMATION-ENGINE.md`'s "Open
question" is now "Resolved"). `packages/automation-engine` was never built as a result.

**Tenant isolation / consistency**: enforced at two layers, not just Zernio's own `409` -
`AutomationsService.create` checks its own `Automation` table for
`(instagramAccountId, zernioPostId)` before calling Zernio, and a database-level
`@@unique` constraint (caught via Prisma error code `P2002`) covers the race between that
check and the actual insert - same defense-in-depth pattern as the callback handler's live
re-confirmation in Phase 8.

## Authentication (Phase 5)

Auth.js (`next-auth@5`) runs entirely inside `apps/web`'s own Next.js server process — a
`Credentials` provider (email + bcrypt-hashed password) backed directly by
`packages/database`'s `User.passwordHash`, JWT session strategy (no `Session`/`Account`
adapter tables needed, since there's no OAuth token to persist). Registration is a Next.js
server action that validates input with a `packages/validation` Zod schema, hashes the
password, and creates the `User` row with `authProvider: "credentials"` and
`authProviderId` set to the (lowercased) email — the first real population of those two
fields, reserved since Phase 4. `apps/web/src/proxy.ts` (Next.js 16's current name for what
was `middleware.ts`) redirects unauthenticated requests to `/sign-in` for every route except
the auth pages themselves, `/status`, and Auth.js's own `/api/auth/*` routes.

## Session verification (Phase 6)

`apps/api` needed to gain real, guarded endpoints in this phase (`organizations`), so it
needed a way to know who's calling it — the thing Phase 5's report deferred. The design:

```
apps/web (Server Component / Server Action)
   │  auth() -> session.user.{id,email}
   ▼
signInternalServiceToken({sub, email}, API_INTERNAL_SECRET)   (packages/shared)
   │  Authorization: Bearer <token>, 60s expiry, minted fresh per call
   ▼
apps/api SessionGuard  ->  verifyInternalServiceToken(...)  ->  request.user
   │
   ▼
every tenant-scoped query resolves organizationId from request.user.id server-side
```

**Deliberately not** apps/api decoding Auth.js's own session cookie directly: that cookie is
a JWE encoded via `@auth/core`'s own HKDF-derived-key scheme, an internal implementation
detail of a library still on a `5.0.0-beta.*` tag (see
`docs/ADR/0004-authentication-provider.md`). Coupling `apps/api` to that would mean it breaks
silently on a `next-auth` version bump it doesn't control. This internal token is a small,
explicit, self-owned contract instead: its own secret (`API_INTERNAL_SECRET`, distinct from
Auth.js's `AUTH_SECRET` — one key, one cryptographic use, never reused across two different
schemes), its own short expiry (minted fresh per server-side call, never stored/reused), and
its own claims shape (`packages/shared/src/internal-service-token.ts`) that only `apps/web`
and `apps/api` need to agree on.

This call only ever happens server-side (`apps/web`'s Server Components/Server Actions), the
same way the `/status` page already calls `apps/api`'s health check — never from the browser,
so there is no CORS or cross-origin-cookie question to solve for this.

## Open decisions (to resolve before the phase that needs them)

- **pnpm workspaces vs Turborepo** — start with plain pnpm workspaces; revisit only if build
  times across `apps/*` actually justify a task-graph build tool (unlikely at this project's
  size).
- **Zernio-side vs local automation matching** (see "Webhook flow" above) — resolved during
  Phase 10/11 implementation by reading Zernio's real docs, not here.
- **Zernio's posts/reels list pagination mechanism** (cursor vs offset) — resolved during
  Phase 9 implementation; preserve whatever Zernio actually uses end to end in our own API
  rather than assuming cursor or building fake offset pagination on top of it.

Redis/BullMQ, object storage, and a general workflow engine are **not** open decisions —
they are retired per `docs/ADR/0005-simplified-mvp-architecture.md`, not "to be decided
later."
