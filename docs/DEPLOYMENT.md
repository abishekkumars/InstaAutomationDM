# Deployment Guide

Status: Phase 0 placeholder. Filled in for real during Phase 22 (Production deployment).
Documented now only at the level the master spec requires: target shape, not step-by-step
instructions for infrastructure that doesn't exist yet.

## Target production topology

```
Internet → Cloudflare (DNS/CDN/WAF) → Nginx (reverse proxy) → {apps/web, apps/api}
                                                                        │
                                                              apps/worker (no public ingress)
                                                                        │
                                                    PostgreSQL, Redis (managed or self-hosted)
```

- `apps/web`, `apps/api`, `apps/worker` each get their own Dockerfile under `infra/docker/`
  (not yet written — no application code to containerize yet) and their own container;
  `apps/worker` has no exposed port.
- Nginx terminates in front of `apps/web`/`apps/api` for self-hosted deployment; Cloudflare
  sits in front of that for DNS, CDN, and WAF.

## Environments

- **Local dev** — see `docs/DEVELOPMENT-SETUP.md`. Docker Compose once Docker is installed,
  or the portable-binary/cloud-dev-DB fallback in the meantime.
- **Staging/Production** — not provisioned yet. Choice of host (self-hosted VM vs a PaaS)
  is an infrastructure decision with real cost/ops implications for the user, not something
  to pick unilaterally — flagged for a future phase, not decided here.

## Release process (target, once Phase 22 arrives)

1. CI green on `main` (lint, typecheck, unit, integration).
2. Build images via `infra/docker/*`.
3. Run Prisma migrations against the target database as an explicit, reviewed step —
   never auto-applied by app startup in production.
4. Roll out `apps/api`/`apps/worker` behind health/readiness checks (`GET /health`,
   `GET /ready` — see `docs/ARCHITECTURE.md`'s observability section once added) before
   directing traffic.
5. Deploy `apps/web`.

## What this document intentionally does not yet contain

Concrete hosting provider, DNS records, secret-management service, backup/restore
procedure, and rollback runbook — all deferred to Phase 22, and to `docs/RUNBOOKS/` for the
operational procedures once there is a running production system to operate.
