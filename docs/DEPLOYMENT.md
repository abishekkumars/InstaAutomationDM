# Deployment Guide

Status: Phase 0 placeholder, **simplified** per
`docs/ADR/0005-simplified-mvp-architecture.md`. Filled in for real during Phase 14
(Production deployment). Documented now only at the level this small, internal-use
application actually needs — not a general SaaS deployment topology.

## Target production topology

```
apps/web (Next.js) ─┐
                     ├─ whatever the actual hosting target provides for TLS/routing
apps/api (NestJS)  ──┘        (no Nginx/Docker/Cloudflare requirement at this scale)
        │
   PostgreSQL (managed or self-hosted)
```

- No Docker, no Nginx, no Cloudflare, and no separate `apps/worker` deployment are required
  by the architecture — see ADR 0005. If the actual hosting target ends up being a platform
  that wants a container anyway (e.g. a PaaS that only accepts a Dockerfile), that's a
  packaging detail decided at Phase 14, not an architectural requirement imposed now.
- `apps/worker` stays as an inert placeholder in the repo (ADR 0005) — not part of the
  deployment topology; nothing runs it in production either.
- `infra/docker/`, `infra/nginx/`, and the root `docker-compose.yml` are unused Phase 0
  placeholders, predating this scope simplification — not part of the current plan (see
  `docs/ARCHITECTURE.md`).

## Environments

- **Local dev** — see `docs/DEVELOPMENT-SETUP.md`.
- **Production** — not provisioned yet. Choice of host is a real decision with cost/ops
  implications for the user, not something to pick unilaterally — flagged for Phase 14, not
  decided here. Given the actual scale (3-4 users, <1,000 API calls/month), this does not
  need to be an elaborate setup.

## Release process (target, once Phase 14 arrives)

1. CI green on `main` (lint, typecheck, unit, integration).
2. Run Prisma migrations against the target database as an explicit, reviewed step — never
   auto-applied by app startup in production.
3. Roll out `apps/api` behind its `/api/health`/`/api/ready` checks before directing traffic.
4. Deploy `apps/web`.

## What this document intentionally does not yet contain

Concrete hosting provider, DNS records, secret-management approach, backup/restore
procedure, and rollback runbook — all deferred to Phase 14, and to `docs/RUNBOOKS/` for the
operational procedures once there is a running production system to operate.
