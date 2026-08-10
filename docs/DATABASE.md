# Database Design

Status: Phase 0 conceptual design. No migrations exist yet (Phase 4). This document is the
target ERD; tables are introduced incrementally, only when the phase that needs them
arrives — do not create the full schema in one migration.

## Engine

PostgreSQL, accessed exclusively through Prisma from `packages/database`. Both `apps/api`
and `apps/worker` import the generated client from that package; neither talks to Postgres
directly.

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

## Tenant isolation rule

Every table below except `users`, `plans`, and `webhook_events` (which is keyed by
provider + external event id and resolved to an org during processing, not before) carries
`organization_id`. No query for tenant-owned data may run without a `WHERE organization_id
= :callerOrgId` clause, and `:callerOrgId` is always derived server-side from the
authenticated session's membership — never from a client-supplied field. This is enforced
at the service layer and proven with explicit cross-tenant-access tests (see
`docs/TESTING.md`).

## Conceptual tables (introduced per-phase)

| Table | Introduced in | Purpose |
|---|---|---|
| `users` | Phase 5 (Auth) | Identity, one row per human account |
| `organizations` | Phase 6 (Multi-tenancy) | Workspace/tenant boundary |
| `organization_members` | Phase 6 | User↔org membership + role |
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

## Full detailed column-level schema

Deferred to Phase 4, written directly as the Prisma schema (`packages/database/schema.prisma`)
plus a generated ERD, rather than duplicated by hand here first — keeping one source of
truth once the schema exists. This document stays the pre-code conceptual map.
