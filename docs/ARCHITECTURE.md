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

## Application shells (Phase 2)

`apps/web`, `apps/api`, and `apps/worker` are scaffolded as minimal, featureless shells —
no auth, no database, no Redis, no Zernio, no automation engine. Real versions installed
(pnpm-resolved, not hand-picked):

| App | Framework | Key versions |
|---|---|---|
| `apps/web` | Next.js, App Router | Next.js `16.3.0`, React `19.2.8`, Tailwind CSS `4.3.3` |
| `apps/api` | NestJS | `@nestjs/core`/`common`/`platform-express` `11.1.29`, `@nestjs/config` `4.0.4` |
| `apps/worker` | plain TypeScript (no framework yet) | `tsx 4.23` for dev-mode watch |

- **`apps/web`**: a responsive shell (mobile-first Tailwind utility classes, a header/main/
  footer layout, `viewport` metadata) with a dashboard placeholder (`/`) and a status page
  (`/status`) that does a server-side fetch of `apps/api`'s `GET /api/health` — proving the
  `NEXT_PUBLIC_API_URL` env wiring works end to end, and degrading gracefully (still `200`,
  shows a "not reachable" message) when the API isn't running rather than erroring. No
  `eslint-config-next` — it reuses the repo's single shared `eslint.config.mjs`
  (`docs/DEVELOPMENT-SETUP.md`/`docs/IMPLEMENTATION-ROADMAP.md` Phase 2 report has the
  rationale); React-specific lint rules (hooks correctness, etc.) can be added later if
  needed.
- **`apps/api`**: global `/api` prefix, `ConfigModule` with a hand-written `validateEnv`
  (no Zod/Joi dependency added yet — deliberately minimal), a request-id middleware
  (`X-Request-Id`, generated or echoed from the caller), a global exception filter
  producing the `{ error: { code, message, requestId } }` shape from `docs/API-SPEC.md`,
  and `GET /api/health`. `GET /ready` is **not** implemented yet — a readiness check with
  nothing real to check (no DB/Redis exist yet) would be a hollow endpoint; it lands with
  Phase 4/11 when there's something to actually report on.
- **`apps/worker`**: bootstrap only — process startup logging and `SIGINT`/`SIGTERM`
  handling, kept alive via `process.stdin.resume()`. No Redis/BullMQ connection; queue
  consumers land in `src/processors/` starting Phase 11 (see that directory's `README.md`).

Original roadmap Phase 3 ("NestJS backend shell") is functionally complete as part of this
Phase 2 work, per explicit instruction to scaffold web + api + worker together — see
`docs/IMPLEMENTATION-ROADMAP.md`'s Phase 2 report for the full rationale.

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
