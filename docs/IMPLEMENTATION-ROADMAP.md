# Implementation Roadmap

Update this file's checkboxes at the end of every phase. Each phase should end with the
artifact checklist in the master prompt (section 27) completed before moving on.

- [x] Phase 0 — Environment + architecture (this phase). See "Phase 0 report" below.
- [ ] Phase 1 — Repository/monorepo foundation (pnpm workspace, root tsconfig/eslint/prettier, CI skeleton)
- [ ] Phase 2 — Next.js frontend shell
- [ ] Phase 3 — NestJS backend shell (+ `/health`, `/ready`)
- [ ] Phase 4 — PostgreSQL + Prisma (first migration: `users` groundwork only as auth needs it)
- [ ] Phase 5 — Authentication (Clerk vs Auth.js decision + implementation)
- [ ] Phase 6 — Multi-tenancy (`organizations`, `organization_members`, tenant-isolation tests)
- [ ] Phase 7 — Instagram account domain model (`instagram_accounts` table, no Zernio calls yet)
- [ ] Phase 8 — Zernio provider abstraction (`InstagramProvider` interface + `ZernioInstagramProvider` skeleton)
- [ ] Phase 9 — Zernio account connection (real OAuth flow)
- [ ] Phase 10 — Webhook ingestion (`POST /webhooks/zernio`, `webhook_events`, idempotency)
- [ ] Phase 11 — Redis + BullMQ (queue wiring, `apps/worker` boots, local Postgres/Redis strategy finalized)
- [ ] Phase 12 — Automation engine (`packages/automation-engine`, generic trigger/condition/action model)
- [ ] Phase 13 — Comment keyword automation (first real trigger wired end to end)
- [ ] Phase 14 — Public comment reply + DM actions
- [ ] Phase 15 — Contact management (`contacts`, `contact_events`, audit logs)
- [ ] Phase 16 — Analytics (`analytics_daily`)
- [ ] Phase 17 — Workflow builder UI (React Flow)
- [ ] Phase 18 — Inbox/conversations (`conversations`, `messages`)
- [ ] Phase 19 — Follow-up workflows (delays, branching)
- [ ] Phase 20 — Billing and usage (`subscriptions`, `plans`, `usage_records`)
- [ ] Phase 21 — Security hardening
- [ ] Phase 22 — Production deployment

## Phase 0 report

**Environment**
- Existing Node: `v16.13.0` (global, untouched)
- Required project Node: `24.x` (Active LTS)
- Project-local Node strategy: official Windows zip distribution extracted to `.tools/node/`
  (gitignored); all scripts prepend it to PATH for that process only. No global installs.
- npm: `8.1.0` (global) — project uses pnpm via the project-local Node's corepack instead.
- Git: `2.49.0.windows.1` — present, usable.
- Docker: **not installed**. Docker Compose: **not available**.
- Corepack: `0.10.0`, bundled with the global Node — project uses the copy bundled with the
  project-local Node 24 instead.
- No admin rights on this machine; project directory is writable without elevation.

**Architecture**
- Final stack, repo structure, modules, and flows: see `docs/ARCHITECTURE.md`.
- Database strategy: PostgreSQL + Prisma, tables introduced per-phase, see `docs/DATABASE.md`.
- Queue strategy: Redis + BullMQ, queues named per master spec section 16, see `docs/ARCHITECTURE.md`.
- Zernio integration strategy: `InstagramProvider`/`ZernioInstagramProvider` abstraction,
  researched against live docs.zernio.com, see `docs/ZERNIO-INTEGRATION.md`.

**Artifacts created in Phase 0**
- `docs/PRODUCT-REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT-SETUP.md`,
  `docs/DATABASE.md`, `docs/ZERNIO-INTEGRATION.md`, `docs/WEBHOOKS.md`,
  `docs/AUTOMATION-ENGINE.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md`,
  `docs/API-SPEC.md`, `docs/IMPLEMENTATION-ROADMAP.md` (this file), `docs/ADR/0001-modular-monolith.md`,
  `docs/ADR/0002-project-local-node-and-no-docker-fallback.md`
- `CLAUDE.md`, `AGENTS.md`, `README.md`
- `.env.example`, `.gitignore`, `docker-compose.yml`, root `package.json`
- `scripts/setup.ps1`, `scripts/dev.ps1`, `scripts/test.ps1`, `scripts/lint.ps1`
- Directory skeleton: `apps/{web,api,worker}`, `packages/{database,shared,validation,zernio,automation-engine}`,
  `infra/{docker,nginx}`, `tests/e2e`, `docs/{ADR,RUNBOOKS}` (each with a placeholder `README.md`)
- Git repository initialized, initial commit made.

**Known limitations / risks**
- No admin rights + no Docker means local Postgres/Redis needs a decision (portable
  binaries vs cloud dev DB) before Phase 4/11 — not blocking Phase 0-3, but flagged now.
- Auth provider (Clerk vs Auth.js) not yet chosen — needed before Phase 5.
- Zernio's story-reply support for Instagram is ambiguous in its own docs (the
  comment-automations API accepts a `story_reply` trigger value, but the Instagram platform
  page says story replies aren't available via the API) — needs hands-on sandbox
  verification before Phase 13 relies on it either way.
- Zernio rate limits aren't documented in the pages reviewed — needed before Phase 12's
  retry/backoff design is finalized.
- pnpm workspace vs Turborepo, and exact CI scope, are decided in Phase 1, not here.

**Next phase**

Phase 1 will: initialize the pnpm workspace (`pnpm-workspace.yaml`), add root-level
`tsconfig.base.json`, ESLint, and Prettier configs shared by all `apps/*`/`packages/*`, and
stand up a minimal GitHub Actions workflow that installs dependencies and runs lint —
nothing else. It does not create any application code inside `apps/web`/`apps/api` yet;
that's Phase 2/3. Phase 1 will not start until the user says to proceed.
