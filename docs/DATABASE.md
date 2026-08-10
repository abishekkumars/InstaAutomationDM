# Database Design

Status: Phase 5 — `User` gained `passwordHash` and had `authProviderId`/`authProvider`
populated for the first time (Auth.js `Credentials` provider — see
`docs/ADR/0004-authentication-provider.md`). `User`, `Organization`, `OrganizationMember`
exist as real, migrated Prisma models (`packages/database/prisma/schema.prisma`), the
minimum needed for Phase 5 (Authentication) and Phase 6 (Multi-tenancy). Every other table
below is still the Phase 0 conceptual map, introduced only when the phase that needs it
arrives.

## Engine

PostgreSQL, accessed exclusively through Prisma from `packages/database`. `apps/api`
depends on `packages/database` via the pnpm workspace protocol and never imports
`@prisma/client` directly; `apps/worker` will do the same once it needs the database
(Phase 11+). Local dev Postgres strategy (no admin rights, no Docker): see
`docs/ADR/0003-local-postgresql-strategy.md`.

## Core relationship

```
User ──< OrganizationMember >── Organization ──< InstagramAccount ──< Automation ──< AutomationRun
                                      │                                    │
                                      ├──< Contact                         └──< AutomationRunStep
                                      ├──< Conversation ──< Message
                                      ├──< AnalyticsDaily
                                      ├──< AuditLog
                                      ├──< WebhookEvent
                                      └──< Subscription (── Plan), UsageRecord
```

Only `User ──< OrganizationMember >── Organization` (the left-hand side) exists today.

## Tenant isolation rule

Every table below except `users`, `plans`, and `webhook_events` (which is keyed by
provider + external event id and resolved to an org during processing, not before) carries
`organization_id`. No query for tenant-owned data may run without a `WHERE organization_id
= :callerOrgId` clause, and `:callerOrgId` is always derived server-side from the
authenticated session's membership — never from a client-supplied field. This is enforced
at the service layer and proven with explicit cross-tenant-access tests (see
`docs/TESTING.md`). No service-layer query code exists yet (Phase 6+); this rule is
recorded now so it governs every future query from the start.

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
  `OrganizationMember`'s composite `(organizationId, userId)`.
- **Indexes**: every `@@index` names the query pattern it exists for, in a comment right
  above it in `schema.prisma` — no index is added "just in case." `organization_members`
  has two: one on `organizationId` (list an org's members) and one on `userId` (list a
  user's orgs) — both are going to be hit on effectively every authenticated request once
  Phase 6 lands.
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

Deliberately minimal — future billing (Phase 20) hangs a `Subscription` table off
`Organization.id` rather than growing fields on this table itself.

- `id` — `cuid()`.
- `name` — display name, no uniqueness constraint (two orgs can share a display name).
- `slug` — unique, indexed (unique implies an index in Postgres). URL-safe handle for
  future routing (e.g. `/org/:slug`). Format validation (lowercase, allowed characters,
  reserved words) is an application-layer concern for whichever phase builds org creation
  (Phase 6) — the schema only guarantees the constraint that matters at the data layer:
  uniqueness.

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

## Conceptual tables (not yet built — introduced per-phase)

| Table | Introduced in | Purpose |
|---|---|---|
| `instagram_accounts` | Phase 7 | Connected IG account, Zernio account/profile id, connection status |
| `automations` | Phase 12 | Name, status, org + account scope |
| `automation_triggers` | Phase 12 | Trigger type + config for an automation |
| `automation_conditions` | Phase 12 | Ordered condition list for an automation |
| `automation_actions` | Phase 12 | Ordered action list for an automation |
| `automation_runs` | Phase 12 | One row per trigger match; overall status |
| `automation_run_steps` | Phase 12 | One row per action executed within a run |
| `contacts` | Phase 15 (Contacts, engine writes to it from Phase 13 on) | The Instagram user an automation interacted with |
| `contact_events` | Phase 15 | Timeline of things that happened to a contact |
| `conversations` | Phase 18 (Inbox) | DM thread with a contact on an account |
| `messages` | Phase 18 | Individual inbound/outbound DM |
| `webhook_events` | Phase 10 (Webhooks) | Raw inbound webhook + idempotency + processing status |
| `jobs` | Phase 11 (Queues) — only if BullMQ's own Redis-side bookkeeping needs a Postgres audit trail; otherwise BullMQ's Redis state is sufficient and this table is skipped |
| `analytics_daily` | Phase 16 | Pre-aggregated per-org/per-automation daily counters |
| `audit_logs` | Phase 15/21 | Security-relevant action log |
| `subscriptions`, `plans`, `usage_records` | Phase 20 (Billing) | Plan assignment + metered usage |

## `webhook_events` (first table with real shape, Phase 10)

```
id               uuid, pk
provider         text            -- 'zernio'
event_id         text            -- Zernio's event id, unique per provider
event_type       text            -- e.g. 'comment.created', 'message.received'
organization_id  uuid, nullable  -- resolved after we look up the account; null if unresolved
account_id       uuid, nullable  -- fk -> instagram_accounts, nullable for same reason
payload          jsonb           -- raw verified payload
status           text            -- 'received' | 'queued' | 'processed' | 'failed'
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
  `.github/workflows/ci.yml`'s `database-tests` job.
- The first migration, `20260810172436_init`, creates `users`, `organizations`,
  `organization_members`, and the `OrganizationRole` enum — reviewed by hand (see
  `packages/database/prisma/migrations/20260810172436_init/migration.sql`) before being
  committed, not blindly trusted.
- `20260810182347_add_password_hash` (Phase 5) adds the single nullable `users.password_hash`
  column for the Auth.js `Credentials` provider — see
  `docs/ADR/0004-authentication-provider.md`.

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
