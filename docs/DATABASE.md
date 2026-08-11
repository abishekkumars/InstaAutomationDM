# Database Design

Status: Phase 10, scope simplified per
`docs/ADR/0005-simplified-mvp-architecture.md`. `User`, `Organization`, `OrganizationMember`,
`InstagramAccount`, `Automation` exist as real, migrated Prisma models
(`packages/database/prisma/schema.prisma`). Every other table below is the (now much
smaller) conceptual map for the remaining MVP phases — introduced only when the phase that
needs it arrives, per this project's usual practice. Phase 9 (listing Instagram posts/reels)
added no schema at all — per the ADR, posts/reels are proxied live from Zernio, never
duplicated into Postgres.

## Engine

PostgreSQL, accessed exclusively through Prisma from `packages/database`. `apps/api`
depends on `packages/database` via the pnpm workspace protocol and never imports
`@prisma/client` directly. Local dev Postgres strategy (no admin rights, no Docker): see
`docs/ADR/0003-local-postgresql-strategy.md`.

## Core relationship

```
User ──< OrganizationMember >── Organization ──< InstagramAccount ──< Automation ──< AutomationRun
                                      │
                                      └──< WebhookEvent
```

`User ──< OrganizationMember >── Organization ──< InstagramAccount` exists today (Phase 7).
Instagram posts/reels are **not** modeled here at all — per ADR 0005 they're read live from
Zernio, never duplicated into Postgres; `Automation` (Phase 10) references a Zernio post/reel
by its Zernio-issued id (a plain string column), not a local foreign key.

## Tenant isolation rule

Every table below except `users` and `webhook_events` (which is keyed by provider +
external event id and resolved to an org during processing, not before) carries
`organization_id`. No query for tenant-owned data may run without a `WHERE organization_id
= :callerOrgId` clause, and `:callerOrgId` is always derived server-side from the
authenticated session's membership — never from a client-supplied field. This is enforced
at the service layer and proven with explicit cross-tenant-access tests (see
`docs/TESTING.md`) — first real example:
`apps/api/src/organizations/organizations.service.ts` (Phase 6).

## Conventions (established in Phase 4, apply to every future table)

- **Primary keys**: Prisma's native `@default(cuid())` on every table — opaque and
  non-sequential (an attacker or curious user can't infer row counts or guess adjacent
  IDs from a sequential integer), and zero extra dependency (unlike `cuid2` or a custom ID
  library) since it's built into Prisma itself. Rejected plain autoincrement integers for
  the enumeration reason above; rejected raw `uuid()` only because `cuid()` gets the same
  non-guessability with slightly better index locality — not a strong reason either way,
  and either would have been acceptable.
- **Timestamps**: `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`
  on every table, no exceptions.
- **Naming**: Prisma model names PascalCase singular (`User`, `OrganizationMember`); Prisma
  field names camelCase; both mapped to snake_case Postgres identifiers via `@map`/`@@map`
  (`created_at`, `organization_members`) — idiomatic on both the TypeScript and SQL sides
  rather than compromising either.
- **Foreign keys / cascade**: every FK so far is `onDelete: Cascade` — deleting a `User` or
  `Organization` deletes its `OrganizationMember` rows. This is deliberate for a pure join
  table with no independent meaning once either side is gone; a future table that
  represents something worth keeping after its parent is deleted (e.g. an audit log entry)
  should use `Restrict` or `SetNull` instead — cascade is not a blanket default, it's
  chosen per relationship.
- **Unique constraints**: every unique constraint documents *why* in the schema comment
  next to it (see `schema.prisma`) — `User.email`, `Organization.slug`,
  `Organization.zernioProfileId`, `OrganizationMember`'s composite
  `(organizationId, userId)`, `InstagramAccount.zernioAccountId` (global, not per-org — see
  below for why that distinction matters here specifically).
- **Indexes**: every `@@index` names the query pattern it exists for, in a comment right
  above it in `schema.prisma` — no index is added "just in case." `organization_members`
  has two: one on `organizationId` (list an org's members) and one on `userId` (list a
  user's orgs); `instagram_accounts` has one on `organizationId` (list an org's connected
  accounts) — all hit on effectively every authenticated request from Phase 6/7 on.
- **Nullable fields**: nullable only when there's a real reason a value can legitimately be
  absent (see `User.name`/`authProviderId`/`authProvider`/`passwordHash` below) — not as a
  default.

## `User`

Provider-independent by design — `id`, not `authProviderId`, is what every other table's FK
points at, so the auth provider could change later without touching any other table. As of
Phase 5 the provider is decided: Auth.js (`next-auth@5`), `Credentials` provider — see
`docs/ADR/0004-authentication-provider.md` for why (open-source/free/self-hosted vs. Clerk,
and why `Credentials` over an OAuth provider). Fields:

- `id` — internal primary key (`cuid()`). Every other table's `userId` FK points here, not
  at any external provider's ID — this is what makes the provider swappable later without
  touching any other table.
- `email` — unique. The one identity attribute virtually every provider supplies, and the
  natural target for org invites (Phase 6). Normalized to lowercase at the application layer
  before every lookup/insert (Postgres's `unique` constraint is case-sensitive by default);
  not enforced at the schema level since Prisma has no built-in case-insensitive unique
  constraint for this column type.
- `name` — nullable. Not every provider hands us a display name immediately (or a user may
  not have set one yet). Unset by the Phase 5 registration flow (email/password only asks
  for those two fields); a user can set it later once profile editing exists.
- `authProviderId` — nullable + unique `String`. Populated as of Phase 5: the user's own
  lowercased email, since a `Credentials` provider has no separate external "subject" the
  way an OAuth provider's `sub` claim would be — email is the closest real analogue, and
  kept distinct from `id` so a future OAuth provider migration could populate this
  differently without touching `id`-based foreign keys anywhere else.
- `authProvider` — nullable `String`, naming *which* provider `authProviderId` belongs to.
  Populated as of Phase 5 with the literal value `"credentials"`. Kept as a separate field
  rather than folding into a single `"provider:id"` string so each half stays independently
  queryable/indexable, and so a provider migration (if it ever happens) can filter on
  `authProvider` directly.
- `passwordHash` — nullable `String`. Bcrypt hash (`bcryptjs`, cost factor 12) of the
  account password, used by the `Credentials` provider's `authorize()` callback
  (`apps/web/src/auth.ts`). Nullable because a user created by a future OAuth provider would
  have no password at all. Never the plaintext password (hashed before the first `prisma`
  call touches it), never selected into any API/session response, never logged — see
  `docs/ADR/0004-authentication-provider.md`'s "Security considerations" for the full review
  of why storing this doesn't conflict with this project's "never store passwords" rule
  (that rule is about Instagram account passwords, not this project's own user accounts).

## `Organization`

Deliberately minimal, and stays that way — no billing/plan fields are planned (retired per
`docs/ADR/0005-simplified-mvp-architecture.md`).

- `id` — `cuid()`.
- `name` — display name, no uniqueness constraint (two orgs can share a display name).
- `slug` — unique, indexed (unique implies an index in Postgres). URL-safe handle for
  future routing (e.g. `/org/:slug`). Format validation (lowercase, allowed characters,
  reserved words) is an application-layer concern for whichever phase builds org creation
  (Phase 6) — the schema only guarantees the constraint that matters at the data layer:
  uniqueness. Also used as the name of this organization's Zernio profile (Phase 8, see
  `zernioProfileId` below) since it's already globally unique.
- `zernioProfileId` — nullable + globally unique `String` (Phase 8). Zernio's own tenant-
  boundary id ("profile" in Zernio's terms — see `docs/ZERNIO-INTEGRATION.md`'s "Zernio
  profiles" section). Nullable because it's created lazily on this organization's first
  Instagram-connect attempt (`POST /v1/profiles`), not at organization-creation time.
  Globally unique because one Zernio profile is 1:1 with one of our organizations, never
  shared.

## `OrganizationMember`

The join table between `User` and `Organization`, plus a role.

- `id` — a single surrogate `cuid()` primary key, **not** a composite
  `@@id([organizationId, userId])`. Chosen so that a future table needing to reference "this
  specific membership" (e.g. an audit log entry recording which membership performed an
  action) can FK to one column instead of carrying a two-column compound key around. The
  actual uniqueness guarantee lives in the `@@unique` below, independent of the primary key
  choice — a surrogate PK does not weaken it.
- `organizationId`, `userId` — FKs, both `onDelete: Cascade` (see Conventions above).
- `role` — `OrganizationRole` enum (`OWNER`, `ADMIN`, `MEMBER`), defaults to `MEMBER`. This
  is vocabulary only — no permission logic anywhere yet; full RBAC is Phase 6+.
- `@@unique([organizationId, userId])` — the same user cannot be added to the same
  organization twice. Verified with a test that creates the pair once successfully and
  asserts the second attempt throws Prisma error code `P2002`
  (`packages/database/src/__tests__/database.test.ts`).
- `@@index([organizationId])` / `@@index([userId])` — "list members of an org" and "list
  orgs a user belongs to," both extremely common query patterns from the moment Phase 6
  lands (every dashboard load, every session's membership check).

## `InstagramAccount` (table added Phase 7, populated for real Phase 8)

An Instagram Business/Creator account connected via Zernio. Phase 7 added the table and its
constraints only; Phase 8 added the real OAuth connect flow
(`apps/api/src/instagram/instagram.service.ts`) that creates and updates these rows -
`apps/web`'s "Connect Instagram" button through to the confirmed-by-a-live-Zernio-call
callback handler, per `docs/ZERNIO-INTEGRATION.md`'s "Account connection" section.

- `id` — `cuid()`.
- `organizationId` — FK, `onDelete: Cascade` (see Conventions above) — deleting an org
  deletes its connected accounts; there's no independent meaning for a connected account
  once its org is gone.
- `zernioAccountId` — **globally unique** `String`, not just unique per organization. This
  is deliberate: an inbound Zernio webhook (Phase 11) identifies the account only by this
  id, and `docs/WEBHOOKS.md`'s org-resolution step ("look up the account, resolve its
  `organization_id`") must have exactly one answer. If the same Zernio account could be
  connected under two different organizations, that lookup would be ambiguous — so the
  schema forbids it outright rather than relying on application code to enforce it.
  Verified with a test that connects the same `zernioAccountId` under two *different* orgs
  and asserts the second attempt throws `P2002`
  (`packages/database/src/__tests__/database.test.ts`).
- `username` — nullable, same reasoning as `User.name`: not every connect path is guaranteed
  to hand us a display handle immediately.
- `status` — `InstagramAccountStatus` enum (`CONNECTED`, `DISCONNECTED`, `ERROR`), defaults
  to `CONNECTED`. Disconnecting doesn't delete the row — a past connection's history (and
  any automation still pointing at it) should survive a revoke/reconnect cycle.
- `@@index([organizationId])` — "list an organization's connected accounts," every
  account-picker UI load from Phase 8 on.

## `Automation` (table added Phase 10)

A comment-to-DM automation, one row per Zernio comment-automation this app created. See
`docs/AUTOMATION-ENGINE.md`'s "Model" section for why this is a fixed shape (one org + one
account + one post + keyword(s) + reply/DM templates), not a generic trigger/condition/action
graph, and its "Resolved" section for why there's no local matching logic - Zernio executes
the automation itself; this table only mirrors the config it was created with.

- `id` — `cuid()`.
- `organizationId` / `instagramAccountId` — FKs, both `onDelete: Cascade`.
- `zernioAutomationId` — **globally unique** `String`, same reasoning as
  `InstagramAccount.zernioAccountId`: an inbound webhook (Phase 11) identifies the automation
  only by this id, and that lookup must have exactly one answer.
- `zernioPostId` — Zernio's own post id (`platformPostId`) this automation is scoped to. The
  post/reel's own content is never stored locally (per ADR 0005) — only this id.
- `keywords` — `String[]` (Postgres text array), **not** a single `String` — Zernio's own
  `POST /v1/comment-automations` takes an array of keywords per automation
  (`docs/ZERNIO-INTEGRATION.md`), and this project's product model is "one keyword, or a
  short list of keywords."
- `matchMode` — `AutomationMatchMode` enum (`CONTAINS`, `WORD`, `EXACT`), defaults to
  `CONTAINS` — same three values, same default, as Zernio's own `matchMode`.
- `commentReply` — nullable `String`. Zernio's own API treats the public reply as optional;
  a DM-only automation with no public reply is a normal, supported configuration.
- `dmMessage` — `String`, required (Zernio requires it too).
- `isActive` — `Boolean`, defaults `true`.
- `@@unique([instagramAccountId, zernioPostId])` — mirrors Zernio's own "only one active
  per-post automation" rule at our own data layer too, not just trusted from Zernio's `409`.
- `@@index([organizationId])` — "list an organization's automations," a future Phase 12
  dashboard/history view.

## Conceptual tables (not yet built — introduced per-phase)

Per ADR 0005, this is the **complete** remaining list — not a subset of a larger planned
schema. No `contacts`, `conversations`, `messages`, `analytics_daily`, `audit_logs`,
`subscriptions`/`plans`/`usage_records`, or a `jobs`/queue-bookkeeping table are planned;
that scope is retired, not deferred.

| Table | Introduced in | Purpose |
|---|---|---|
| `automation_runs` | Phase 12 | One row per trigger match, for basic status/history (MVP item 13) — shape (e.g. whether a separate `automation_run_steps` table is worth it) decided when this phase is built, not speculated now |
| `webhook_events` | Phase 11 | Raw inbound webhook + idempotency + processing status |

## `webhook_events` (first table with real shape, Phase 11)

```
id               uuid, pk
provider         text            -- 'zernio'
event_id         text            -- Zernio's event id, unique per provider
event_type       text            -- e.g. 'comment.created', 'message.received'
organization_id  uuid, nullable  -- resolved after we look up the account; null if unresolved
account_id       uuid, nullable  -- fk -> instagram_accounts, nullable for same reason
payload          jsonb           -- raw verified payload
status           text            -- 'received' | 'processed' | 'failed' (no 'queued' state -
                                 -- processing happens in-process, same request, per ADR 0005)
received_at      timestamptz
processed_at      timestamptz, nullable
error_message     text, nullable

unique (provider, event_id)
```

The `unique (provider, event_id)` constraint is the idempotency mechanism: a duplicate
delivery hits a unique-violation on insert, which the webhook handler treats as
"already received, return 200, do nothing else."

## Migrations

Prisma Migrate only. No manual `ALTER TABLE` against any environment, including local dev.
Schema changes always go through a generated migration file committed to the repo.

- **Local dev**: `pnpm --filter @automationdm/database run migrate:dev` (creates a new
  migration from schema changes and applies it) — requires the local Postgres to be running
  first (`.\scripts\db.ps1 start`, see the ADR).
- **CI/production-style apply**: `pnpm --filter @automationdm/database run migrate:reset` for a
  full reset in dev, or `migrate:deploy` (no schema-diffing, just applies already-committed
  migration files — the correct command for CI and any real deployment) — used by
  `.github/workflows/ci.yml`'s `backend-tests` job.
- The first migration, `20260810172436_init`, creates `users`, `organizations`,
  `organization_members`, and the `OrganizationRole` enum — reviewed by hand (see
  `packages/database/prisma/migrations/20260810172436_init/migration.sql`) before being
  committed, not blindly trusted.
- `20260810182347_add_password_hash` (Phase 5) adds the single nullable `users.password_hash`
  column for the Auth.js `Credentials` provider — see
  `docs/ADR/0004-authentication-provider.md`.
- `20260810202052_add_instagram_accounts` (Phase 7) creates `instagram_accounts` and the
  `InstagramAccountStatus` enum.
- `20260811021921_add_zernio_profile_id_to_organizations` (Phase 8) adds the nullable, unique
  `organizations.zernio_profile_id` column.
- `20260811171420_add_automations_table` (Phase 10) creates `automations` and the
  `AutomationMatchMode` enum.

## Prisma client

`packages/database/src/client.ts` exports a single lazily-created `PrismaClient` singleton
(reused across dev hot-reloads via a `globalThis` guard — a fresh `PrismaClient` per reload
would otherwise open an unbounded number of Postgres connections until the server refuses
new ones), logging only `warn`/`error` levels (never `query`, which would include bound
parameter values, and never the connection string itself anywhere). `apps/api`'s
`DatabaseModule`/`PrismaService` (`apps/api/src/database/`) wraps this singleton with
NestJS's `OnModuleInit`/`OnModuleDestroy` lifecycle so the app connects on startup and
disconnects cleanly on shutdown (`app.enableShutdownHooks()` in `apps/api/src/main.ts`).

## Full detailed column-level schema

`packages/database/prisma/schema.prisma` is the single source of truth from this phase
on — this document explains the *reasoning* behind it, not a duplicate listing that could
drift out of sync.
