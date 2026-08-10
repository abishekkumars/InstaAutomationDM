# Architecture

Status: Phase 0 baseline. This is the target architecture for the MVP and near-term
phases. It will be revisited via ADRs (`docs/ADR/`) if reality forces a change, not edited
silently.

## Guiding constraint

Modular monolith, not microservices, from day one. Three deployable units
(`apps/web`, `apps/api`, `apps/worker`), each internally organized into modules with clear
boundaries, so that any module *could* be extracted into its own service later without a
rewrite — but none is extracted until there's a real operational reason to.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + React Hook Form + Zod + TanStack Query + React Flow | Matches master spec; React Flow specifically for the workflow builder (Phase 17) |
| Backend | NestJS + TypeScript, REST + WebSocket | Modular DI container maps directly onto the module list below |
| Database | PostgreSQL + Prisma | Relational data (orgs, contacts, automations) with strong migration story |
| Queue | Redis + BullMQ | Webhook processing and DM sending must never block the HTTP request/response cycle |
| External integration | Zernio API (Instagram via Meta Graph API under the hood) | See `docs/ZERNIO-INTEGRATION.md` |
| Auth | Clerk or Auth.js — **not yet decided**, see Open Decisions | SaaS auth (orgs, invites, sessions) without hand-rolling password storage |
| Object storage | S3-compatible, Cloudflare R2 in production | Media attachments, exports |
| Infra | Docker Compose (dev), Nginx (self-hosted deploy), Cloudflare (DNS/CDN/WAF) | Per master spec; local dev fallback documented in `docs/DEVELOPMENT-SETUP.md` since Docker isn't installed on the current dev machine |

## Repository layout

```
apps/
  web/      Next.js frontend
  api/      NestJS HTTP + WS API
  worker/   BullMQ consumers
packages/
  database/            Prisma schema + generated client
  shared/               cross-cutting types/utilities
  validation/           Zod schemas (form + webhook validation)
  zernio/                InstagramProvider + ZernioInstagramProvider
  automation-engine/     trigger/condition/action execution engine
infra/
  docker/    Dockerfiles per app
  nginx/     reverse proxy config
docs/        all artifacts described in the master prompt
scripts/     PowerShell dev scripts (project-local tooling only)
tests/e2e/   Playwright specs
```

`packages/automation-engine` and `packages/zernio` are deliberately separate from
`apps/api` so the execution engine can be unit tested with no NestJS or database
dependency, and so Zernio is never called directly from anywhere except that one package.

## Backend modules (apps/api)

`auth`, `organizations`, `users`, `members`, `instagram`, `zernio`, `webhooks`,
`automations`, `automation-engine` (thin NestJS wrapper around `packages/automation-engine`),
`contacts`, `conversations`, `messages`, `analytics`, `usage`, `billing`, `notifications`,
`health`, `audit`.

Not all of these exist by the MVP — see `docs/IMPLEMENTATION-ROADMAP.md` for which phase
introduces which module. Creating an empty module ahead of the phase that needs it is
avoided; premature scaffolding is itself a form of uncontrolled change.

## Request flow

```
Browser → Cloudflare/reverse proxy → Next.js (apps/web)
                                         │  API calls
                                         ▼
                                  NestJS API (apps/api)
                                         │
                          ┌──────────────┼───────────────┐
                          ▼              ▼                ▼
                    PostgreSQL       Redis/BullMQ     packages/zernio
                    (source of      (enqueue only,        │
                     truth)         never source          ▼
                                     of truth)        Zernio API → Instagram
```

## Webhook flow

```
Instagram → Zernio → Zernio webhook → POST /webhooks/zernio (apps/api, webhooks module)
                                          │
                                          ▼
                              1. Validate signature (X-Zernio-Signature, HMAC-SHA256)
                              2. Validate payload schema (packages/validation)
                              3. Persist raw event to webhook_events (idempotency key = event id)
                              4. If duplicate event id → 200 OK, no further action
                              5. Enqueue BullMQ job on `webhook-processing` queue
                              6. Return HTTP 200 immediately
                                          │
                                          ▼ (async, apps/worker)
                              automation-engine: resolve org → resolve IG account →
                              find active automations → match trigger → evaluate
                              conditions → create automation_run → execute actions
                              (public reply / send DM / tag / etc via packages/zernio) →
                              record automation_run_steps → update analytics_daily
```

The HTTP handler for `POST /webhooks/zernio` never does DB writes beyond the
`webhook_events` insert, never calls Zernio, and never runs automation logic — that all
happens in the worker, off the request path, per the "never process long-running automation
work inside the webhook HTTP request" rule.

## Multi-tenancy

```
User → Organization → Instagram Account → Automations → Contacts → Conversations → Analytics
```

Every tenant-owned table carries `organization_id`. `organization_id` is **never** taken
from client-supplied input — the service layer resolves it from the authenticated
session/membership on every request. Tenant isolation is covered by dedicated tests (see
`docs/TESTING.md`), not just code review.

## Open decisions (to resolve before the phase that needs them)

- **Auth provider** (Clerk vs Auth.js) — decide in Phase 5. Clerk is faster to ship
  multi-tenant org/invite flows out of the box; Auth.js avoids a paid third-party auth
  dependency but means building org/invite UX by hand. Not decided yet — this is an
  external-service choice, flagged for the user rather than picked unilaterally.
- **Local Postgres/Redis strategy** (Docker vs portable binaries vs cloud dev DBs) — see
  `docs/DEVELOPMENT-SETUP.md`. Decide in Phase 4/11.
- **pnpm workspaces vs Turborepo** — start with plain pnpm workspaces (section 7 of the
  master spec only requires Turborepo "if it provides clear value"); revisit once build
  times across `apps/*` actually justify a task-graph build tool.
