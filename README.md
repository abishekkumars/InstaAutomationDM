# Instagram Automation SaaS

Multi-tenant SaaS for Instagram DM automation (comment triggers → keyword matching → public
reply → private DM → buttons/links → contacts → analytics), built on the [Zernio](https://docs.zernio.com/)
API. See [`docs/PRODUCT-REQUIREMENTS.md`](docs/PRODUCT-REQUIREMENTS.md) for the full vision
and MVP scope.

**Status:** Phase 0 (environment + architecture) complete. No application code yet — see
[`docs/IMPLEMENTATION-ROADMAP.md`](docs/IMPLEMENTATION-ROADMAP.md).

## Start here

- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — operating rules for AI agents working in this repo.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, module layout, request/webhook flow.
- [`docs/DEVELOPMENT-SETUP.md`](docs/DEVELOPMENT-SETUP.md) — this machine's constraints (no admin, no Docker, global Node 16) and the project-local tooling strategy that works around them.
- [`docs/IMPLEMENTATION-ROADMAP.md`](docs/IMPLEMENTATION-ROADMAP.md) — phase-by-phase status.

## Getting started (once Phase 1+ lands real dependencies)

```powershell
.\scripts\setup.ps1
.\scripts\dev.ps1
```

Both scripts use a project-local Node runtime under `.tools/node/` — they never touch this
machine's global Node install and never require administrator rights.

## Repository layout

```
apps/       web (Next.js) · api (NestJS) · worker (BullMQ)
packages/   database · shared · validation · zernio · automation-engine
infra/      docker · nginx
docs/       all project artifacts (requirements, architecture, DB, API, security, ADRs, ...)
scripts/    PowerShell dev scripts
tests/e2e/  Playwright specs
```
