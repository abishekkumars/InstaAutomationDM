# ADR 0005: Simplified MVP architecture (small internal app, not a general SaaS)

## Status
Accepted.

## Context

Every prior phase (0-6) built toward the master prompt's original framing: a general-purpose,
multi-tenant Instagram DM automation **SaaS** — Redis + BullMQ for async processing, a
dedicated `apps/worker` process, S3/R2 object storage, Nginx + Docker + Cloudflare for
production, and a roadmap covering contacts/CRM, analytics pipelines, a visual workflow
builder, an inbox UI, billing/plans, and a generic trigger/condition/action automation
engine.

The actual product need has been clarified: this is a **small internal/limited-use
application** — approximately 3-4 users, fewer than 1,000 API calls per month. The MVP is
exactly 13 concrete capabilities:

1. Authentication
2. Organization/multi-tenancy
3. Connect Instagram through Zernio
4. List Instagram posts/reels with pagination
5. Click a post/reel
6. Create a comment automation for that specific post/reel
7. Configure keyword
8. Configure public comment reply
9. Configure private DM
10. Save the automation
11. Receive the relevant Zernio webhook
12. Trigger the configured automation
13. Basic automation status/history

Nothing about that list needs a queue, a second runtime process, object storage, a reverse
proxy, or containerization to work correctly at this scale. Continuing to carry that
infrastructure as "planned/required" in the docs — and continuing to grow the roadmap toward
CRM/billing/analytics/workflow-builder features nobody asked for — is architectural drift
away from the actual requirement, not progress toward it.

This is exactly the situation `CLAUDE.md` describes: "if a phase turns up a reason the
documented architecture doesn't work, write an ADR in `docs/ADR/` and flag it, don't just
diverge." This ADR is that — and it triggers one direct edit to `CLAUDE.md` itself (see
Consequences), since one of its hard rules assumed the now-retired worker/queue split.

## Decision

Simplify to a plain modular monolith:

```
Next.js (apps/web) -> NestJS (apps/api) -> PostgreSQL/Prisma (packages/database) -> Zernio
```

**Not introduced unless a concrete requirement appears later**: Redis, BullMQ, a second
runtime process for queue consumers, S3/R2 or any object storage, Nginx, Docker,
microservices, an event bus, a complex analytics pipeline, a CRM, billing, or a general
trigger/condition/action workflow engine.

**`apps/worker`** (scaffolded in Phase 2) stays in the repo as an inert placeholder rather
than being deleted — removing it now would be pure churn for a directory that costs nothing
to leave alone, and it documents where queue consumers would land *if* this decision is ever
revisited. No BullMQ wiring, no queue connection, no processors are built into it.

**Webhook processing moves in-process.** `POST /webhooks/zernio` (Phase 11 in the new
numbering, see the roadmap) validates the signature, persists a `webhook_events` row for
idempotency, then executes the matched automation's actions (public reply + DM, at most a
couple of outbound Zernio REST calls) directly in the same request, and returns. At <1,000
calls/month total this is not a load problem; `webhook_events` remains the single source of
truth either way, so moving to an async queue later — if usage ever actually grows into a
reason to — is an additive change to *how* the row gets processed, not a schema or API
redesign.

**Automation model shrinks from a generic engine to one fixed shape.** No `Trigger`/
`Condition[]`/`Action[]` graph, no branching, no delays, no tagging, no contacts. One
automation = one organization + one connected Instagram account + one specific Zernio
post/reel + a keyword (or keyword list) + a public reply template + a DM template. This is
exactly items 6-10 of the MVP list, nothing more. Whether the *matching itself* happens in
our own code or is delegated entirely to Zernio's own `comment-automations` API (which
already accepts `keywords`/`matchMode`/`commentReply`/`dmMessage` server-side per
`docs/ZERNIO-INTEGRATION.md`) is **not decided by this ADR** — that is an implementation
question for the phase that builds it, to be answered by reading Zernio's real docs at that
time (per `CLAUDE.md`'s "never invent Zernio API behavior" rule), not guessed at now.

**Instagram posts/reels are not duplicated into Postgres.** Listing/showing them (MVP items
4-5) reads live from Zernio on demand. If Zernio's list endpoint is cursor-paginated, our
backend preserves cursor-based pagination end to end rather than faking offset pagination on
top of it — the exact cursor mechanics are verified against Zernio's real docs during that
phase, not assumed here.

**What Postgres stores**: `users`, `organizations`, `organization_members` (all exist,
Phase 4/6), `instagram_accounts` (Phase 7), `automations` (Phase 10, the simplified shape
above), `automation_runs`/status-tracking rows for item 13 (Phase 12), and `webhook_events`
if the idempotency mechanism needs its own table (likely yes, per Phase 11). No `contacts`,
`conversations`, `messages`, `analytics_daily`, `audit_logs`, `subscriptions`, `plans`, or
`usage_records` tables — removed from the conceptual map entirely, not just deprioritized.

## Consequences

- **`CLAUDE.md` hard rule updated in this same change**: "Never process automation logic
  synchronously inside the `/webhooks/zernio` HTTP handler — validate, persist, enqueue,
  return. Everything else happens in `apps/worker`" is rewritten to permit in-process
  execution, referencing this ADR, while keeping the underlying safety property (fast
  response, no unbounded work) intact in spirit.
- Docs updated to match: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/WEBHOOKS.md`,
  `docs/AUTOMATION-ENGINE.md`, `docs/ZERNIO-INTEGRATION.md` (pagination note),
  `docs/DEPLOYMENT.md`, `docs/PRODUCT-REQUIREMENTS.md`, `docs/TESTING.md`, and
  `docs/IMPLEMENTATION-ROADMAP.md` (Phase 7 onward rewritten; the old Phase 11 "Redis +
  BullMQ" and Phase 15-20 "Contacts/Analytics/Workflow builder/Inbox/Follow-ups/Billing" are
  retired — listed with reasons in the roadmap rather than silently deleted, so the decision
  stays traceable).
- **Unaffected by this decision** (already built, already correct for this scope, nothing to
  redo): PostgreSQL + Prisma (`docs/ADR/0003-local-postgresql-strategy.md`), Auth.js
  (`docs/ADR/0004-authentication-provider.md`), the `apps/web` -> `apps/api` internal
  session-verification token, and the multi-tenancy/tenant-isolation work from Phase 6 — all
  of it is exactly what MVP items 1-2 need and none of it assumed the now-retired
  infrastructure.
- If usage ever genuinely outgrows this (concretely: webhook processing measurably delays
  responses, or a real requirement for background/scheduled work shows up), the fix is to
  revisit *this* ADR with a new one — not to have silently kept Redis/BullMQ/Docker "on the
  roadmap" for a need that may never materialize.

## Alternatives considered

**Keep the original general-SaaS architecture as documented and simply defer building the
unused pieces.** Rejected: that's the status quo this ADR is correcting, not an alternative
to it. Leaving Redis/BullMQ/S3/Nginx/Docker/CRM/billing/workflow-builder listed as "planned"
when the actual product will not need them at this scale is architectural drift, not
caution — it invites building infrastructure nobody asked for and makes the docs an
inaccurate map of what this application actually is.
