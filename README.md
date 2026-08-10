# AutomationDM

A small, internal-use tool for attaching a keyword-triggered Instagram comment automation
(public reply + DM) to a specific post/reel, built on the [Zernio](https://docs.zernio.com/)
API. Scoped for ~3-4 users and under 1,000 API calls/month — see
[`docs/ADR/0005-simplified-mvp-architecture.md`](docs/ADR/0005-simplified-mvp-architecture.md)
for why this is deliberately small, and
[`docs/PRODUCT-REQUIREMENTS.md`](docs/PRODUCT-REQUIREMENTS.md) for the exact MVP scope.

**Status:** Phase 6 of `docs/IMPLEMENTATION-ROADMAP.md` complete — authentication (Auth.js)
and multi-tenancy (organizations/membership, with `apps/api` session verification and
tenant-isolation tests) are real and working. Instagram/Zernio integration (Phase 7 onward)
has not started yet.

## Start here

- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — operating rules for AI agents working in this repo.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, module layout, request/webhook flow.
- [`docs/DEVELOPMENT-SETUP.md`](docs/DEVELOPMENT-SETUP.md) — this machine's constraints (no admin, no Docker, global Node 16) and the project-local tooling strategy that works around them.
- [`docs/IMPLEMENTATION-ROADMAP.md`](docs/IMPLEMENTATION-ROADMAP.md) — phase-by-phase status and reports.

## Getting started

```powershell
.\scripts\setup.ps1
.\scripts\db.ps1 start
.\scripts\dev.ps1
```

All scripts use a project-local Node runtime under `.tools/node/` — they never touch this
machine's global Node install and never require administrator rights. You'll also need a
local `.env` (copy `.env.example`) with `DATABASE_URL`, `AUTH_SECRET`, and
`API_INTERNAL_SECRET` filled in — see `docs/DEVELOPMENT-SETUP.md` for how to generate them.

## Repository layout

```
apps/       web (Next.js) · api (NestJS) · worker (inert placeholder, see ADR 0005)
packages/   database · shared · validation · zernio · automation-engine
docs/       all project artifacts (requirements, architecture, DB, API, security, ADRs, ...)
scripts/    PowerShell dev scripts
```

`infra/` and the root `docker-compose.yml` are unused Phase 0 placeholders, not part of the
current plan — see `docs/ARCHITECTURE.md`.
