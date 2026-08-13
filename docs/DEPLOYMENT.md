# Deployment Guide

Production is **Vercel + Supabase**, provisioned and running. This document describes the real
topology rather than the generic placeholder it replaced (which predated the actual hosting
decision and described "whatever the hosting target provides").

Scope discipline still applies per `docs/ADR/0005-simplified-mvp-architecture.md`: 3-4 users,
under 1,000 API calls/month. There is no Docker, no Nginx, no Cloudflare, no queue, and no
`apps/worker` deployment.

## Topology

```
                        Vercel project "web"          Vercel project "api"
  browser  ──TLS──►  apps/web (Next.js)  ──HTTPS──►  apps/api (NestJS)  ──►  Zernio REST
                       region bom1                     region bom1
                                                            │
                                                            ▼
                                              Supabase PostgreSQL (ap-south-1)
```

- **Two Vercel projects from one monorepo**, distinguished by Root Directory (`apps/web` and
  `apps/api`). They deploy independently from the same commit.
- **`apps/api` runs as a single serverless function.** `apps/api/api/index.ts` is the Vercel
  entrypoint; `apps/api/vercel.json` rewrites `/(.*)` to `/api` so Nest's own router handles every
  path inside one function. `src/main.ts` still exists and is still the entry for local
  development — the difference is only who owns the socket (see the comments in `api/index.ts`).
- **`apps/worker` is not deployed.** It remains an inert placeholder per ADR 0005.
- **Region colocation is a correctness-adjacent requirement, not a preference.** With functions in
  `iad1` and the database in Sydney, page loads ran 5-8 s. Both tiers and the database are now in
  Mumbai (`bom1` / `ap-south-1`). If either is ever moved, move all of them — see ADR 0006 for the
  measurements.

## Environment variables

Set per Vercel project, in the project's own Environment Variables settings. Names and purposes
are documented in `.env.example`; that file holds placeholders only and must never carry real
values.

**`apps/api` project**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** (port 6543, `?pgbouncer=true`). Runtime queries. Pooled because each cold serverless instance would otherwise open its own direct connection. |
| `DIRECT_URL` | Supabase session pooler / direct connection (port 5432). Prisma migrations and introspection only, never runtime. |
| `ZERNIO_API_KEY` | Server-side only. Never reaches `apps/web` or the browser. |
| `ZERNIO_WEBHOOK_SECRET` | HMAC-SHA256 verification of `X-Zernio-Signature` on inbound webhooks (Phase 11). |
| `API_INTERNAL_SECRET` | HS256 secret for the `apps/web` → `apps/api` bearer token. Must be **identical** in both projects. |
| `APP_URL` | `apps/api`'s own view of where `apps/web` lives, used to build the Zernio OAuth `redirect_url` server-side so a client-supplied redirect target is never trusted. |

**`apps/web` project**

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Auth.js session signing. Rotating it invalidates every existing session. |
| `API_INTERNAL_SECRET` | Must match the `apps/api` project exactly, or every API call 401s. |
| `NEXT_PUBLIC_API_URL` | Base URL of the deployed `apps/api` project. |
| `NEXT_PUBLIC_APP_URL` | Public base URL of `apps/web`. |

Copy both Supabase connection strings verbatim from Supabase's "Connect" dialog — do not
hand-assemble them.

> `.env.example` still lists `REDIS_URL`, `S3_*`, and `SENTRY_DSN` from the pre-ADR-0005 scope.
> No code reads them and they are not set in production. They are stale and should be removed.

## Caching and freshness

`apps/web` caches its reads in the Vercel Data Cache with a 60-second TTL, invalidated by tag.
This has a user-visible consequence — dashboard figures can be up to a minute old — and a
deployment consequence: **the Sync button is the only mechanism that forces fresh data**, so any
new mutating server action must invalidate the tags it affects or users will keep seeing stale
numbers. See `docs/ADR/0006-response-caching-and-freshness.md`.

Note that the Data Cache **survives a deployment**. Cache entry shapes are therefore versioned in
the key (`['callApiCached', 'v2', path]` in `apps/web/src/lib/api.ts`); changing what is stored
without bumping that version would have the first request after a deploy read the old shape.

## Release process

1. CI green on `main` — `scripts/lint.ps1` (eslint + typecheck + prettier) and `scripts/test.ps1`.
2. **Run Prisma migrations against the target database as an explicit, reviewed step**, using
   `DIRECT_URL`. Never auto-applied by app startup.
3. Deploy the `apps/api` project. Confirm `/api/health` (no DB) and `/api/ready` (SELECT 1).
4. Deploy the `apps/web` project.

Order matters only when a release changes the API contract: `apps/web` calls `apps/api` on every
render, so deploying web first against an older API is the failure case to avoid.

## Rollback

Vercel keeps previous deployments; promoting an earlier one is the rollback path for either app.
Database migrations are **not** covered by that — a migration that drops or rewrites data has no
automatic inverse, which is why step 2 is explicit and reviewed rather than automatic.

## Keep-alive (Supabase free-tier pausing)

Supabase's free tier pauses a project after 7 days with no database activity.
`.github/workflows/keep-alive.yml` pings `apps/api`'s `/ready` endpoint (which runs `SELECT 1`
via Prisma) once a day to prevent that. It reads the deployed `apps/api` URL from the
repository variable `API_READY_URL` (Settings -> Secrets and variables -> Actions -> Variables
tab - a plain variable, not a secret, since it's just a public URL) set to
`https://<your-api-project>.vercel.app/ready`. Not needed once/if the Supabase project is on a
paid plan, since paid projects are never auto-paused.

## What this document still does not cover

Custom DNS records, a backup/restore procedure, and an incident runbook. Deferred to
`docs/RUNBOOKS/`. Secret management is currently "Vercel project environment variables and
nothing else", which is adequate at this scale but is not a rotation procedure.
