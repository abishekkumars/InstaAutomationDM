# AutomationDM

A small, internal-use tool for attaching a keyword-triggered Instagram comment automation
(public reply + DM) to a specific post/reel, built on the [Zernio](https://docs.zernio.com/)
API. Scoped for ~3-4 users and under 1,000 API calls/month — see
[`docs/ADR/0005-simplified-mvp-architecture.md`](docs/ADR/0005-simplified-mvp-architecture.md)
for why this is deliberately small, and
[`docs/PRODUCT-REQUIREMENTS.md`](docs/PRODUCT-REQUIREMENTS.md) for the exact MVP scope.

**Status:** Phase 10.2 of `docs/IMPLEMENTATION-ROADMAP.md` complete — authentication
(Auth.js), multi-tenancy (organizations/membership, with `apps/api` session verification and
tenant-isolation tests), the Instagram account connection flow, listing an account's
existing posts/reels, comment-automation creation with up to 3 DM buttons (all verified
against Zernio's live API), and a redesigned, responsive dashboard (an org-wide automations
list, pulled forward from Phase 12) are real and working. Live send/click stats (a real
Zernio field, re-verified live) are designed but not yet surfaced anywhere (Phase 10.3).
Automation execution/webhook ingestion (Phase 11 onward) has not started yet — Zernio
executes created automations server-side already.

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
local `.env` (copy `.env.example`) with `DATABASE_URL`, `AUTH_SECRET`, `API_INTERNAL_SECRET`,
and `APP_URL` filled in — see `docs/DEVELOPMENT-SETUP.md` for how to generate them. A valid
`ZERNIO_API_KEY` is additionally needed for the Instagram connect flow (Phase 8) to work
against the real Zernio API — not required for the rest of the app, and not needed to run
the automated test suite (it uses a fake provider).

## Repository layout

```
apps/       web (Next.js) · api (NestJS) · worker (inert placeholder, see ADR 0005)
packages/   database · shared · validation · zernio · automation-engine
docs/       all project artifacts (requirements, architecture, DB, API, security, ADRs, ...)
scripts/    PowerShell dev scripts
```

`infra/` and the root `docker-compose.yml` are unused Phase 0 placeholders, not part of the
current plan — see `docs/ARCHITECTURE.md`.
