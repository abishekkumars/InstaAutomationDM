# Implementation Roadmap

Update this file's checkboxes at the end of every phase. Each phase should end with the
artifact checklist in the master prompt (section 27) completed before moving on.

**Numbering note:** there is no separate "Phase 3" checklist entry below, and that is not
an error. The roadmap originally planned Phase 2 (Next.js shell) and Phase 3 (NestJS
shell) as two separate units of work. The user's actual Phase 2 instruction explicitly
bundled both of those plus `apps/worker`'s bootstrap shell into one pass, executed and
reported as "Phase 2" (see its report below). Rather than leave a checkbox for a "Phase 3"
that never ran as its own phase, that scope is folded into the Phase 2 line and the
standalone entry is removed. Every phase number from 4 onward is **unchanged** — they
match the phase references already used throughout `docs/DATABASE.md`,
`docs/ZERNIO-INTEGRATION.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, and
`docs/ADR/0002-project-local-node-and-no-docker-fallback.md` — so nothing past Phase 2
needed renumbering. History (the Phase 0/1/2 reports) is preserved exactly as written.

- [x] Phase 0 — Environment + architecture. See "Phase 0 report" below.
- [x] Phase 1 — Repository/monorepo foundation (pnpm workspace, root tsconfig/eslint/prettier, CI skeleton). See "Phase 1 report" below.
- [x] Phase 2 — Application shells: Next.js (`apps/web`) + NestJS (`apps/api`) + worker bootstrap (`apps/worker`). Absorbs what was originally planned as a separate "Phase 3 — NestJS backend shell" (see the numbering note above and the Phase 2 report below).
- [x] Phase 2 stabilization — project-local Node runtime enforcement + diagnostics (`scripts/pnpm.ps1`, `scripts/doctor.ps1`). See "Phase 2 stabilization report" below.
- [x] Phase 4 — PostgreSQL + Prisma (`User`/`Organization`/`OrganizationMember` foundation for auth + multi-tenancy). See "Phase 4 report" below.
- [x] Phase 5 — Authentication (Auth.js decision + real sign-in, see "Phase 5 report" below).
- [x] Phase 6 — Multi-tenancy (real org creation/membership, apps/api session verification, tenant-isolation tests — see "Phase 6 report" below).

**Scope simplification (2026-08-11):** the product scope was substantially narrowed after
Phase 6 — see `docs/ADR/0005-simplified-mvp-architecture.md`. This is a small internal tool
(~3-4 users, <1,000 API calls/month), not a general SaaS. Every phase below this point is
rewritten to match the new, exact 13-item MVP list from that ADR; nothing past this point
was implemented under the old numbering (Phase 7 below is **not** the same as any
previously-drafted "Phase 7" — the old draft never shipped, so this isn't a renumbering of
completed work, just a rewrite of what hadn't started yet).

- [x] Phase 7 — Instagram account domain model + Zernio provider abstraction
  (`instagram_accounts` table, org-scoped; `InstagramProvider` interface +
  `ZernioInstagramProvider` skeleton in `packages/zernio` — no live Zernio calls yet). See
  "Phase 7 report" below.
- [ ] **Phase 8 — Zernio account connection** (real OAuth flow, populates `instagram_accounts`) — **next phase**
- [ ] Phase 9 — List + view Instagram posts/reels (fetched live from Zernio, not stored in
  Postgres per ADR 0005; preserve Zernio's real pagination mechanism — verify cursor vs
  offset against its docs before building, don't assume)
- [ ] Phase 10 — Comment automation creation (`automations` table: one org + one connected
  account + one specific Zernio post/reel + keyword(s) + public reply template + DM
  template; create/save UI on the post/reel detail page; whether matching runs on our side
  or Zernio's own `comment-automations` API does it end to end is decided here, against
  Zernio's real docs, not assumed)
- [ ] Phase 11 — Webhook ingestion + automation trigger (`POST /webhooks/zernio`,
  `webhook_events` idempotency, in-process execution — no queue, per ADR 0005)
- [ ] Phase 12 — Automation status/history (run/status records + a simple list/detail UI —
  the MVP's item 13, not a general analytics pipeline)
- [ ] Phase 13 — Security hardening (scoped to this app's actual size — tenant isolation,
  secret hygiene, dependency audit; not enterprise-scale rate limiting/WAF work)
- [ ] Phase 14 — Production deployment (whatever the actual hosting target needs when this
  is reached; no Docker/Nginx/Cloudflare requirement per ADR 0005)

**Retired (not deferred — see `docs/ADR/0005-simplified-mvp-architecture.md` for why)**:
Redis + BullMQ queue wiring, a generic trigger/condition/action automation engine, contact
management/CRM, an analytics pipeline, a visual workflow builder UI, an inbox/conversations
UI, follow-up workflows (delays/branching), and billing/usage/plans. None of these are part
of the current MVP; any of them could come back as their own future ADR if a concrete
requirement ever appears, but they are not "later phases" on this roadmap anymore.

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

## Phase 1 report

**What was built**
- `pnpm-workspace.yaml` (`apps/*`, `packages/*`) — pnpm workspaces, not Turborepo (see
  `docs/ARCHITECTURE.md` open decisions; revisit only once build times justify it).
- Root `tsconfig.base.json` (strict, `NodeNext`, `noEmit`) extended by a `tsconfig.json` in
  every workspace member.
- Root `eslint.config.mjs` (flat config): `@eslint/js` recommended + `typescript-eslint`
  recommended + `eslint-config-prettier` (turns off stylistic rules Prettier owns).
- Root `.prettierrc.json` / `.prettierignore` (Markdown excluded for now — see note below)
  and `.editorconfig`.
- Every `apps/*` and `packages/*` member got a minimal `package.json` (scoped
  `@automationdm/*`, `lint`/`typecheck` scripts) + `tsconfig.json` + a placeholder
  `src/index.ts` (`export {};`) — just enough for the workspace tooling to have something
  real to check; no framework, no business code.
- Root `package.json`: removed the npm-style `workspaces` field (redundant with
  `pnpm-workspace.yaml`), simplified `engines.node` to `>=20`, added `eslint`/`typecheck`/
  `format`/`format:check` scripts and the eslint/typescript-eslint/prettier/typescript
  devDependencies.
- `scripts/lint.ps1` now runs `eslint`, `typecheck`, and `format:check` (was previously
  wired to a `--recursive lint`/`typecheck` pattern that no per-package script yet backed).
- `scripts/test.ps1` now uses `--if-present` so it no-ops cleanly until a package defines a
  real `test` script (none does yet — no test runner is introduced in Phase 1).
- `.github/workflows/ci.yml` — `actions/checkout` → `actions/setup-node@v4` (Node 24) →
  `corepack enable` → `pnpm install --frozen-lockfile` → `pnpm run eslint` →
  `pnpm run typecheck` → `pnpm run format:check`. Runs on GitHub's own ubuntu-latest
  runner, not the local dev machine — installing Node/pnpm there does not conflict with the
  "never touch this machine's global Node" rule, which is scoped to the local dev box.
- `.gitignore`: added `.claude/` (AI tool session state, not a project artifact).

**Commands executed and results**
| Command | Result |
|---|---|
| `node --version` / `npm --version` (before) | `v16.13.0` / `8.1.0` (global, untouched) |
| `.\scripts\setup.ps1` | Downloaded Node `v24.19.0` zip to `.tools/node/`, enabled corepack, ran `pnpm install` — 9 workspace projects, 110 packages resolved. Exit 0. |
| `.\scripts\lint.ps1` (1st run) | ESLint: 0 errors. Typecheck: 8/8 packages `Done`. `format:check`: **failed** — 4 files (`.github/workflows/ci.yml`, `docker-compose.yml`, `eslint.config.mjs`, `pnpm-workspace.yaml`) not Prettier-formatted (double vs single quotes). |
| `pnpm run format` | Rewrote those 4 files to match `.prettierrc.json` (`singleQuote: true`). |
| `.\scripts\lint.ps1` (2nd run) | ESLint: 0 errors. Typecheck: 8/8 `Done`. `format:check`: **all files pass**. Exit 0. |
| `.\scripts\test.ps1` | No package defines `test` yet → no-op via `--if-present`. Exit 0. |
| `act` (run CI workflow locally) | **Not available** — not installed, and it also depends on Docker, which isn't installed either (see Phase 0). Substituted by running the workflow's actual commands (`eslint`, `typecheck`, `format:check`) locally, which is what the workflow itself runs. |
| `node --version` / `npm --version` (after) | `v16.13.0` / `8.1.0`, same path (`C:\Program Files\nodejs`) — **unchanged** |
| `git status --ignored` | Confirms `.tools/` and `node_modules/` are ignored, not staged |
| secret scan (`.env*` presence + grep for key/secret/token/password literals in new/changed files) | No `.env` file present (only `.env.example`), no hardcoded secret-like values found |

**Files created**
`pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`,
`.prettierignore`, `.editorconfig`, `.github/workflows/ci.yml`, `pnpm-lock.yaml`
(generated), and per workspace member (`apps/web`, `apps/api`, `apps/worker`,
`packages/database`, `packages/shared`, `packages/validation`, `packages/zernio`,
`packages/automation-engine`): `package.json`, `tsconfig.json`, `src/index.ts`.

**Files modified**
`package.json` (root), `scripts/lint.ps1`, `scripts/test.ps1`, `docker-compose.yml`
(Prettier quote-style only), `.gitignore` (added `.claude/`), this file.

**Known limitations**
- No test runner is wired up yet (Vitest/Jest, per `docs/TESTING.md`) — intentionally out
  of scope for Phase 1; `scripts/test.ps1` and the root `test` script exist but are no-ops
  until a real package needs them.
- Markdown files are excluded from Prettier's `format:check` (`.prettierignore`) to avoid
  reformatting the prose-heavy Phase 0 docs as an unrelated side effect of this phase;
  revisit if/when Markdown formatting in CI becomes a real requirement.
- `act`/Docker aren't available on this machine, so the GitHub Actions workflow itself has
  only been validated by running its component commands locally and by its own YAML
  parsing succeeding under Prettier — not by an actual local Actions run. It will get its
  first real run on the next `git push` to a GitHub remote (not done here — no remote is
  configured, and none should be pushed to without being asked).

## Phase 2 report

**Scope note**: the user's Phase 2 instruction explicitly bundled what this roadmap had
listed as two separate phases — Phase 2 (Next.js shell) and Phase 3 (NestJS shell) — plus
pulled `apps/worker`'s bootstrap shell forward from Phase 11. Both are marked complete
above; Phase 11 still owns the actual Redis/BullMQ connection and queue processors.

**What was built**
- `apps/web`: Next.js `16.3.0` (App Router, Turbopack) + React `19.2.8` + Tailwind CSS
  `4.3.3` (CSS-first config, `@tailwindcss/postcss`, no `tailwind.config.js` needed). A
  responsive shell (`src/app/layout.tsx`: header/main/footer, mobile-first Tailwind
  breakpoints, `viewport` metadata), a dashboard placeholder (`src/app/page.tsx`), and a
  server-rendered status page (`src/app/status/page.tsx`) that fetches `apps/api`'s
  `GET /api/health` and degrades gracefully if it's unreachable. Reuses the repo's single
  shared `eslint.config.mjs` rather than adding `eslint-config-next`.
- `apps/api`: NestJS `11.1.29` + `@nestjs/config` `4.0.4`. Global `/api` prefix,
  `ConfigModule` with a hand-written `validateEnv` (`PORT`, `NODE_ENV`; no Zod/Joi
  dependency added), `HealthModule`/`HealthController` (`GET /api/health`), a request-id
  middleware (`X-Request-Id`, generated via `crypto.randomUUID()` or echoed from the
  caller), and a global `AllExceptionsFilter` producing
  `{ error: { code, message, requestId } }` (matches `docs/API-SPEC.md`/`docs/SECURITY.md`
  — no internals leaked for non-`HttpException`s). `GET /ready` intentionally **not**
  added yet (see `docs/API-SPEC.md`).
- `apps/worker`: no framework — plain TypeScript, `tsx` for dev-mode watch. `src/main.ts`
  logs startup, registers `SIGTERM`/`SIGINT` handlers, stays alive via
  `process.stdin.resume()`. `src/processors/README.md` documents where each future BullMQ
  consumer lands (Phase 11).
- Removed the Phase 1 placeholder `src/index.ts` from all three apps (superseded by real
  entrypoints).
- `.env.example`: added `PORT=4000`.
- `scripts/dev.ps1`: added `--if-present` (matches the pattern already used in
  `scripts/test.ps1`) so it won't hard-fail if any workspace member lacks a `dev` script.
- Updated `apps/{web,api,worker}/README.md`, `docs/ARCHITECTURE.md`, `docs/API-SPEC.md`,
  `docs/DEVELOPMENT-SETUP.md` to describe what's actually implemented.

**Commands executed and results**
| Command | Result |
|---|---|
| `pnpm install` (adds next/react/tailwind/nestjs/tsx) | Exit 0. First pass surfaced an unmet peer: `@nestjs/config@3.3.0` wanted `@nestjs/common@^8‖9‖10`, had `11.1.29`. Bumped `@nestjs/config` to `^4.0.0` → resolved `4.0.4`, reinstalled, peer warning gone. |
| `pnpm install` (adds `@types/node`) | A first build attempt on `apps/worker` failed — `tsc` had no ambient `console`/`process` types (nothing in its then-empty dependency tree pulled in `@types/node`). Added `@types/node@^24.0.0` to all three apps explicitly rather than relying on transitive luck. Exit 0. |
| `pnpm --filter @automationdm/web run build` (1st attempt) | **Failed** — see PATH gotcha below. |
| (fixed: `$env:PATH` now has `.tools/node` prepended) `pnpm --filter @automationdm/api run build` | `nest build`, exit 0 |
| `pnpm --filter @automationdm/worker run build` | `tsc`, exit 0 |
| `pnpm --filter @automationdm/web run build` (2nd attempt, correct PATH) | `next build` (Turbopack), exit 0. Routes: `○ /` and `○ /_not-found` static, `ƒ /status` correctly dynamic (due to its `cache: 'no-store'` fetch). |
| `.\scripts\lint.ps1` (1st run) | ESLint 0 errors, typecheck 8/8 packages `Done`, Prettier flagged 5 files (quote-style on newly written files) |
| `pnpm run format` | Auto-fixed those 5 files |
| `.\scripts\lint.ps1` (2nd run) | ESLint 0 errors, typecheck 8/8 `Done`, Prettier all pass. Exit 0. |
| Rebuild api/worker after formatting | Both exit 0 again |
| Manual smoke test: start `apps/api` (`node dist/main.js`) | Boots, logs `Mapped {/api/health, GET} route` |
| `curl` (via `Invoke-WebRequest`/`curl.exe`) `GET /api/health` | `200`, `{"status":"ok","service":"api","timestamp":"...","uptimeSeconds":13}`, `X-Request-Id` header present |
| Same, with an inbound `X-Request-Id: test-corr-id-123` header | Echoed back unchanged — confirms the middleware prefers a caller-supplied id |
| `GET /api/does-not-exist` | `404`, `{"error":{"code":"NotFoundException","message":"Cannot GET /api/does-not-exist","requestId":"..."}}` — confirms the exception filter's shape and that `requestId` matches the response header |
| Start `apps/web` (`next start`, api still running), `GET /status` | `200`, page body contains "API reachable" + the embedded health JSON |
| Stop `apps/api`, `GET /status` again | Still `200`, page body contains "API not reachable" + a helpful hint — confirms graceful degradation, no crash |
| Start `apps/worker` (`node dist/main.js`) | Logs `[worker] AutomationDM worker starting...` / `No queues are registered yet`, stays alive as intended |
| `node --version` / `npm --version` (throughout, fresh shells with no PATH override) | `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — **unchanged** |

No automated test framework was added (per instruction: "do not introduce a large testing
framework unless required"); the manual smoke test above stands in for it this phase. Real
automated tests (Vitest/Playwright per `docs/TESTING.md`) arrive when there's real business
logic worth testing.

**PATH gotcha found during verification** (full detail in `docs/DEVELOPMENT-SETUP.md`,
"Phase 2 update"): invoking `pnpm` directly via `.\.tools\node\corepack.cmd pnpm ...` in a
fresh shell — without first prepending `.tools/node` to `$env:PATH` — runs `pnpm` correctly
but lets it spawn child script processes (`next build`, `nest build`, `tsc`) under whichever
`node` is first on the *ambient* `PATH`, which was still the global Node 16. `next build`
hard-checks `process.version` and refused to run, which is what surfaced this; `nest build`/
`tsc` have no such check and would have silently "succeeded" under Node 16 without it being
obvious. Fixed by explicitly setting `$env:PATH` before every direct `pnpm` invocation in
this session, and documented so it isn't repeated. `scripts/*.ps1` were never affected —
they already prepend `.tools/node` correctly via `scripts/_env.ps1`.

**Files created**
`apps/web/{package.json,tsconfig.json,next-env.d.ts,next.config.mjs,postcss.config.mjs,
src/app/{globals.css,layout.tsx,page.tsx,status/page.tsx},src/lib/env.ts}`;
`apps/api/{package.json,tsconfig.json,nest-cli.json,src/{main.ts,app.module.ts,
config/env.validation.ts,common/{types/express.d.ts,middleware/request-id.middleware.ts,
filters/all-exceptions.filter.ts},health/{health.module.ts,health.controller.ts}}}`;
`apps/worker/{package.json (rewritten),tsconfig.json (rewritten),src/main.ts,
src/processors/README.md}`.

**Files modified**
`scripts/dev.ps1`, `.env.example`, `apps/{web,api,worker}/README.md`,
`docs/ARCHITECTURE.md`, `docs/API-SPEC.md`, `docs/DEVELOPMENT-SETUP.md`, this file.
`apps/web/next-env.d.ts` was additionally auto-regenerated by `next build` itself (adds
`.next/types` references) — expected, not hand-edited.

**Files removed**
`apps/web/src/index.ts`, `apps/api/src/index.ts`, `apps/worker/src/index.ts` (Phase 1
placeholders, superseded by real entrypoints).

**Known limitations / risks**
- No automated tests yet for `apps/api`'s health endpoint, error filter, or request-id
  middleware — covered by manual smoke test only this phase; add real unit/e2e coverage
  once Vitest/Playwright are wired up (still not required until a phase that needs them).
- `apps/web` has no React-specific ESLint rules (no `eslint-config-next`) — acceptable for
  a two-page shell; revisit if the component surface grows enough that hooks-correctness
  linting earns its dependency cost.
- `GET /api/ready` deferred — see `docs/API-SPEC.md`.
- Local Postgres/Redis strategy still unresolved (unchanged from Phase 0/1) — Phase 4/11.
- Auth provider (Clerk vs Auth.js) still unresolved — Phase 5.

## Phase 2 stabilization report

Requested before starting Phase 4, to fix a real developer-experience risk surfaced during
Phase 2 verification (see that report's "PATH gotcha" above) before building on top of it.
No PostgreSQL, Prisma, Redis, auth, or Zernio work — pure tooling/documentation hardening.

**What changed**
- `scripts/_env.ps1`'s `Assert-ProjectLocalNode` no longer just prepends `.tools/node` to
  `$env:PATH` and trusts it — it now re-resolves `node` with `Get-Command`, confirms the
  resolved executable's directory is exactly `.tools/node` (not merely present somewhere on
  PATH), confirms the version is `>= 20`, and exits with a clear error otherwise. Every
  existing `scripts/*.ps1` picks this up automatically since they all dot-source this file.
- New `scripts/pnpm.ps1` — canonical wrapper for any ad hoc pnpm command
  (`.\scripts\pnpm.ps1 --filter @automationdm/api run build`, etc.), so there is a safe
  option for cases the four fixed-purpose scripts don't cover, instead of falling back to
  invoking `pnpm`/`corepack` directly.
- New `scripts/doctor.ps1` — environment diagnostics: project root, whether
  `.tools/node/` exists, what `node` resolves to before vs. after the PATH fix-up, npm/pnpm
  versions, and an explicit "Using project-local: True/False", exiting non-zero with a
  clear message if the wrong runtime would be used. Added as `pnpm run doctor` too.
- `docs/DEVELOPMENT-SETUP.md`: new "Enforcing the project-local Node runtime" section
  documenting all of the above, plus the verified answer on whether bare `pnpm` is safe
  (see below).
- `CLAUDE.md` / `AGENTS.md`: point at `scripts/pnpm.ps1` / `scripts/doctor.ps1` as the
  canonical way to run anything not already covered by `setup`/`dev`/`lint`/`test`, and add
  the plain-ASCII-in-`.ps1`-files rule (see bug found, below).
- This file: removed the standalone "Phase 3" checklist line (see the numbering note at
  the top of this document) and added this report.

**Bug found and fixed while building the fix**: the first draft of `scripts/_env.ps1`
used an em dash inside a `Write-Error` string. Windows PowerShell 5.1 reads `.ps1` files
without a UTF-8 BOM using the legacy system codepage, which corrupted that multi-byte
character and broke the string's closing quote, surfacing as a confusing
`TerminatorExpectedAtEndOfString` parse error several lines below the actual cause. Fixed
by making every `scripts/*.ps1` file plain ASCII, and documented so it isn't repeated —
`.md` files are unaffected (not parsed by PowerShell).

**Is bare `pnpm` safe or unsafe?** Tested directly: a fresh shell running `pnpm --version`
gets "the term 'pnpm' is not recognized" — there is currently no bare `pnpm` on `PATH` at
all, because the global Node 16's bundled corepack was never `enable`d against that global
install (we deliberately never did that), so it exposes no global `pnpm` shim; the only
`pnpm` that exists anywhere on this machine lives inside `.tools/node/`. That is a **safe
failure today, but an incidental one, not an enforced one** — it depends entirely on nobody
ever running `corepack enable` globally or `npm install -g pnpm` on this machine. **Bare
`pnpm` (and equally, a direct call to `.tools\node\corepack.cmd pnpm` or
`.tools\node\pnpm.cmd` without first going through `scripts/_env.ps1`) must be treated as
unsafe regardless of what it happens to do right now** — always use `scripts/pnpm.ps1` or
one of the fixed-purpose scripts instead.

**Verification**
| Check | Result |
|---|---|
| `scripts/doctor.ps1` in a fresh shell | Reports global Node `v16.13.0` before the fix-up, project-local `v24.19.0` after, `Using project-local: True`. Exit 0. |
| `scripts/doctor.ps1` with `.tools/node` temporarily renamed away (simulated missing runtime) | Fails immediately with "No project-local Node runtime at ... Run .\scripts\setup.ps1 first.", exit 1. Runtime restored immediately after. |
| `scripts/pnpm.ps1 --version` | `9.15.0` (the pinned project-local pnpm), exit 0 |
| `apps/api` build (`.\scripts\pnpm.ps1 --filter @automationdm/api run build`, i.e. `nest build`) | Exit 0 |
| `apps/worker` build (`... run build`, i.e. `tsc`) | Exit 0 |
| `apps/web` build (`... run build`, i.e. `next build`) | Exit 0, same route summary as Phase 2 (`/` and `/_not-found` static, `/status` dynamic) |
| `.\scripts\lint.ps1` (ESLint + typecheck + Prettier check) | All pass, exit 0 |
| `node --version` / `npm --version` in a fresh shell, before and after all of the above | `v16.13.0` / unchanged at `C:\Program Files\nodejs` throughout |

No application functionality was added or changed — same three shells as the end of
Phase 2, just built/linted through the hardened entry points instead of ad hoc commands.

## Phase 4 report

**PostgreSQL strategy**: `embedded-postgres` (npm package, wrapping official Postgres 17.10
binaries), controlled via direct `pg_ctl` calls rather than that package's own start/stop
API. Full reasoning, alternatives considered, and security notes:
`docs/ADR/0003-local-postgresql-strategy.md`.

**What was built**
- `packages/database`: `prisma/schema.prisma` (`User`, `Organization`,
  `OrganizationMember`, `OrganizationRole` enum — see `docs/DATABASE.md` for the full
  per-field reasoning), one migration (`20260810172436_init`), a hot-reload-safe
  `PrismaClient` singleton (`src/client.ts`) exported via `src/index.ts`, an idempotent
  dev-only seed (`prisma/seed.mjs`), 11 Vitest integration tests against a real local
  Postgres (`src/__tests__/database.test.ts`), and the local DB lifecycle tool
  (`dev/local-db.mjs`, invoked via `scripts/db.ps1 start|stop|status|reset`).
- `apps/api`: `DatabaseModule`/`PrismaService` (`src/database/`, `@Global()`, Nest
  `OnModuleInit`/`OnModuleDestroy` + `app.enableShutdownHooks()` in `main.ts`), and a new
  `GET /api/ready` (`src/health/readiness.controller.ts`) that runs `SELECT 1` through
  Prisma and returns `503` (standard `{error:{code,message,requestId}}` shape) if the
  database is unreachable — the first endpoint with something real to check, exactly as
  Phase 2's report said it would when this phase arrived.
- `scripts/_env.ps1`: new `Import-DotEnv` function, called from `scripts/pnpm.ps1`,
  `scripts/dev.ps1`, and `scripts/test.ps1` — loads the repo-root `.env` into the process
  environment (ambient env vars, e.g. from CI, always win over the file), **except
  `NODE_ENV`**, which is deliberately never imported this way (see the regression below).
- `.github/workflows/ci.yml`: new `database-tests` job — a `postgres:16-alpine` service
  container, `prisma migrate deploy`, then the database test suite. **Not executed
  remotely** — no `act`/Docker locally (unchanged since Phase 0/1), no push done.
- `eslint.config.mjs`: added the `globals` package and a `**/*.mjs`/`**/*.cjs` override
  declaring Node globals — needed because typescript-eslint's recommended config disables
  the base `no-undef` rule for `.ts` files (the compiler already covers it), but plain
  `.mjs` dev scripts aren't processed by that parser and had no Node-global awareness at
  all until this phase's `local-db.mjs`/`seed.mjs` needed `console`/`process`.
- Docs: `docs/DATABASE.md` (full rewrite — real schema + conventions, not just the
  conceptual map), `docs/ARCHITECTURE.md` (new "Database (Phase 4)" section, open-decisions
  list updated), `docs/API-SPEC.md` (`GET /api/ready` documented), `docs/DEVELOPMENT-SETUP.md`
  (new "Local PostgreSQL" section), `.env.example` (`DATABASE_URL` comment points at the
  ADR; still just `DATABASE_URL=`, no value), `packages/database/README.md` and
  `apps/api/README.md` rewritten to match reality.

**A real regression found and fixed during this phase's own validation pass**: adding
`Import-DotEnv` to `scripts/pnpm.ps1` caused `apps/web`'s build to start failing —
`NODE_ENV=development` from `.env` was being forced onto the `next build` invocation, which
needs to manage its own internal production/development mode; the conflict surfaced as a
dev/prod React-instance mismatch (`TypeError: Cannot read properties of null (reading
'useContext')` while prerendering Next's built-in `_global-error` page). Fixed by excluding
`NODE_ENV` from `Import-DotEnv` entirely — every tool that cares about it (`next`, `nest`,
`tsc`) already manages it correctly on its own, and `apps/api/src/config/env.validation.ts`
already has its own sensible default for when it's genuinely unset. Caught by this phase's
own "rebuild all three apps" validation step, not shipped unnoticed.

**Also found and fixed (Windows-specific, documented in full in the ADR)**: `pg_ctl start`
hung indefinitely on Windows because the `postgres.exe` grandchild process it spawns can
inherit `pg_ctl`'s stdout/stderr pipe handles, so Node's `spawnSync` waited forever for
those pipes to close even though the server had already started successfully and `pg_ctl`
itself had exited. Fixed with `stdio: 'ignore'` for that specific call.

**Commands executed and results**
| Command | Result |
|---|---|
| `pnpm install` (adds prisma, `@prisma/client`, `embedded-postgres`, `@embedded-postgres/windows-x64`, vitest, dotenv) | Exit 0. ~97 MB Windows Postgres binary downloaded; its `postinstall` (`hydrate-symlinks.js`) ran without needing any pnpm build-script approval. |
| `node dev/local-db.mjs start` (1st attempt, before the Windows pipe-inheritance fix) | Hung indefinitely despite the server actually starting (confirmed via the Postgres log file and `Get-Process` while the call was still blocked) — killed manually, fixed, retested clean. |
| `.\scripts\db.ps1 start` / `status` / `stop` / `start` again (full cycle, after the fix) | All exit 0; `status` correctly reports running/not-running across separate invocations; re-`start` correctly detects "already running" and no-ops. |
| `prisma migrate dev --name init` | Created database `automationdm`, applied migration `20260810172436_init`, generated Prisma Client 6.19.3, ran the seed (`"user dev@automationdm.local owns organization dev-workspace"`). Exit 0. |
| `prisma migrate status` | "1 migration found ... Database schema is up to date!" |
| `prisma validate` | "The schema at prisma\schema.prisma is valid" |
| `pnpm --filter @automationdm/database run build` | `tsc`, exit 0 |
| `pnpm --filter @automationdm/database run test` (vitest) | **11/11 passed** — connectivity, User/Organization/OrganizationMember creation, relation traversal both directions, cascade delete, and three `P2002` unique-constraint-violation assertions (email, slug, and the org+user composite) |
| `pnpm --filter @automationdm/api run build` | `nest build`, exit 0 |
| Manual smoke test: `node dist/main.js` (api) with `DATABASE_URL` set, `GET /api/ready` | `200 {"status":"ready",...}` |
| Same, with an inbound `X-Request-Id` header and after `.\scripts\db.ps1 stop` | `503`, standard error shape, `requestId` matches the response header — confirmed graceful failure, not a crash |
| `pnpm --filter @automationdm/worker run build` | `tsc`, exit 0 |
| `pnpm --filter @automationdm/web run build` (1st attempt, before the `NODE_ENV` fix) | **Failed** — see regression above |
| Same, after the fix | `next build` (Turbopack), exit 0, same route summary as Phase 2/2-stabilization |
| `.\scripts\lint.ps1` (1st run, before the `globals` fix) | ESLint: **26 errors** (`no-undef` on `console`/`process` in the two new `.mjs` files) + Prettier flagged 3 files. Typecheck: 8/8 `Done`. |
| `pnpm run format` + `eslint.config.mjs`/`package.json` fix (added `globals`) + reinstall | — |
| `.\scripts\lint.ps1` (2nd run) | ESLint 0 errors, typecheck 8/8 `Done`, Prettier all pass. Exit 0. |
| Rebuild `packages/database`, `apps/api`, `apps/worker`, `apps/web` once more after the lint fixes | All exit 0 again; database tests re-run 11/11 |
| `node --version` / `npm --version`, fresh shells, before/after everything above | `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — **unchanged** |

**Files created**
`docs/ADR/0003-local-postgresql-strategy.md`; `scripts/db.ps1`;
`packages/database/{prisma/{schema.prisma,seed.mjs,migrations/20260810172436_init/migration.sql},
dev/local-db.mjs,src/{client.ts,__tests__/database.test.ts},vitest.config.ts,vitest.setup.ts}`;
`apps/api/src/{database/{database.module.ts,prisma.service.ts},health/readiness.controller.ts}`.

**Files modified**
`packages/database/{package.json,tsconfig.json,README.md,src/index.ts}`;
`apps/api/{package.json,README.md,src/{app.module.ts,main.ts,health/health.module.ts}}`;
`scripts/{_env.ps1,pnpm.ps1,dev.ps1,test.ps1}`; `eslint.config.mjs`; `package.json` (root);
`.github/workflows/ci.yml`; `.env.example`;
`docs/{DATABASE.md,ARCHITECTURE.md,API-SPEC.md,DEVELOPMENT-SETUP.md}`; this file.
`apps/web/next-env.d.ts` auto-regenerated by `next build` again, as in prior phases.

**Files intentionally not committed**
`.env` (real local `DATABASE_URL`, gitignored, created for this phase's own verification —
confirmed via `git check-ignore -v`); `.tools/postgres-data/` and
`.tools/postgres-data.log` (local Postgres data directory + log, gitignored since Phase 0).

**Known limitations / risks**
- Prisma 6.19.3 has a major update available (7.9.1) — not taken in this phase; upgrading a
  major version mid-foundation is its own decision, not a side effect of adding the schema.
- The `package.json#prisma` config key (used for the seed command) is deprecated as of
  Prisma 6 in favor of a `prisma.config.ts` file, removed entirely in Prisma 7 — noted, not
  migrated yet, since it still works today and migrating it is naturally bundled with
  whichever future phase does take the Prisma 7 upgrade.
- Local Postgres lifecycle (`local-db.mjs`) is verified on `win32-x64` only; the
  platform-package lookup table covers Mac/Linux names but only the Windows binary package
  is an installed dependency right now (see the ADR).
- No tenant-isolation tests yet — there's nothing to isolate until Phase 6 adds
  `organization_id` scoping to real queries; this phase's tests cover the schema itself
  (constraints, relations), not authorization.
- Auth provider (Clerk vs Auth.js) still unresolved — Phase 5, next.
- Local Redis strategy still unresolved — Phase 11.

## Phase 5 report

**Decision**: Auth.js (`next-auth@5`), `Credentials` provider — chosen over Clerk (paid,
external account, not self-hosted) specifically because this project's requirement is
open-source/free/self-hosted, and chosen over an OAuth provider within Auth.js because that
would require external app registration + credentials from the user before this phase could
proceed. Full reasoning, alternatives, and security review:
`docs/ADR/0004-authentication-provider.md`.

**What was built**
- `packages/database`: `User.passwordHash` (nullable), one migration
  (`20260810182347_add_password_hash`); `docs/DATABASE.md`'s `User` section rewritten to
  match — `authProviderId`/`authProvider` finally populated (`"credentials"` / the user's
  lowercased email), reserved since Phase 4 for exactly this.
- `packages/validation`: scaffolded for real (previously an empty placeholder) —
  `credentialsSchema` (Zod), builds to `dist/` via `tsc` the same way `packages/database`
  does, since `apps/web` now consumes it as a real runtime dependency.
- `apps/web`: `src/auth.config.ts` (Edge-safe: providers `[]`, `callbacks.authorized` for
  route protection) + `src/auth.ts` (the real config: `Credentials` provider, `authorize()`
  hashes/compares via `bcryptjs` against `packages/database`); `src/proxy.ts` (Next.js 16's
  current name for `middleware.ts`) redirects unauthenticated requests to `/sign-in` for
  every route except `/sign-in`, `/sign-up`, `/status`, and `/api/auth/*`;
  `src/app/(auth)/actions.ts` (`signInAction`/`registerAction`/`signOutAction` server
  actions); `/sign-in` and `/sign-up` pages with client-side form components using React
  19's `useActionState`; `src/app/api/auth/[...nextauth]/route.ts` (Auth.js's own handler);
  `src/types/next-auth.d.ts` (module augmentation adding `id` to `Session.user`);
  `src/app/layout.tsx` now shows the signed-in user's email + a sign-out button, or a
  sign-in link.
- `.env.example`: `AUTH_SECRET`'s comment now points at the ADR and shows a local
  PowerShell one-liner to generate a value — explicitly not an external credential.
- Docs: `docs/ADR/0004-authentication-provider.md` (new); `docs/ARCHITECTURE.md` (stack
  table + new "Authentication (Phase 5)" section, open-decisions entry removed);
  `docs/SECURITY.md` (AuthN/AuthZ section rewritten); `docs/DATABASE.md` (`User` section +
  migrations list + status line); `docs/DEVELOPMENT-SETUP.md` (new "Authentication (Phase
  5)" section); `apps/web/README.md` (rewritten); this file.

**A real regression found and fixed during this phase's own manual browser test** (per
`CLAUDE.md`'s "start the dev server and use the feature in a browser" rule): `apps/web`'s
plain `next dev`/`next start` fell back to the ambient `PORT=4000` env var (loaded from
`.env` by Phase 4's `Import-DotEnv`, intended for `apps/api`), so `apps/web` tried to bind
the same port as `apps/api` instead of `3000`. Fixed by pinning `-p 3000` explicitly in both
scripts — confirmed via Next's own bundled CLI docs that an explicit flag always wins over
the env var. Full detail: `docs/DEVELOPMENT-SETUP.md`'s Phase 5 section.

**Also found while building this**: Next.js 16 deprecates the `middleware.ts` file
convention in favor of `proxy.ts` (same API). Used the new name from the start since this is
new code, not a migration — confirmed the deprecation warning disappears and the build
output correctly still lists `ƒ Proxy (Middleware)`.

**Commands executed and results**
| Command | Result |
|---|---|
| `pnpm install` (adds `next-auth`, `bcryptjs`, `zod`, workspace links for `@automationdm/database`/`@automationdm/validation` into `apps/web`) | Exit 0. |
| `prisma migrate dev --name add_password_hash` | Applied migration, regenerated Prisma Client 6.19.3. Reviewed the generated SQL by hand (single nullable column add) before proceeding. |
| `pnpm --filter @automationdm/database run build` / `run test` | `tsc` exit 0; **11/11 vitest tests pass** (unchanged suite, confirms the new nullable column didn't break anything). |
| `pnpm --filter @automationdm/validation run build` | `tsc`, exit 0 (first real build — was previously an empty placeholder). |
| `pnpm --filter @automationdm/web run typecheck` / `run build` (1st attempt) | Both passed; build initially warned "middleware file convention is deprecated" — addressed by renaming to `proxy.ts` (see above), rebuilt clean afterward. |
| Manual browser test: `pnpm --filter @automationdm/web run dev` (before the port fix), navigate to `http://localhost:3000` | **Failed** — server actually bound to `4000`, colliding with `apps/api`'s port; see the port regression above. |
| Same, after pinning `-p 3000` | `http://localhost:3000/` correctly redirected (unauthenticated) to `/sign-in` via `src/proxy.ts`. |
| Sign up at `/sign-up` with a fresh email/password | Account created, immediately signed in, redirected to `/`; header shows the email + "Sign out". |
| Click "Sign out" | Session cleared, redirected to `/sign-in`. |
| Sign in again with the same credentials | Succeeds, redirected to `/`, session restored. |
| Sign in with the correct email + a wrong password | Rejected with "Invalid email or password." — no redirect, form re-rendered with the error. |
| Sign up again with the same, now-existing email | Rejected with "An account with that email already exists." — no duplicate row created. |
| Direct DB query (throwaway script, deleted after use) against the row created above | `authProvider: "credentials"`, `authProviderId: "<the email>"`, `passwordHash` present and bcrypt-formatted (`$2b$12$...`) — confirms the fields populate exactly as designed, and the hash, not the plaintext, is what's stored. |
| `.\scripts\lint.ps1` (ESLint + typecheck across all 9 workspace projects + Prettier) | ESLint 0 errors, typecheck 9/9 `Done`, Prettier all pass. Exit 0. |
| `.\scripts\test.ps1` | `packages/database`: 11/11 passed (unchanged). |
| `pnpm --filter @automationdm/api run build` / `@automationdm/worker run build` | Both `nest build`/`tsc`, exit 0 — confirms this phase's schema/package changes didn't regress either app. |
| `pnpm --filter @automationdm/validation run build` / `@automationdm/web run build` (final) | Both exit 0; `apps/web`'s route list now includes `/sign-in`, `/sign-up`, `/api/auth/[...nextauth]`, and `ƒ Proxy (Middleware)`. |
| `node --version` / `npm --version`, fresh shell, throughout | `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — **unchanged**. |

**Files created**
`docs/ADR/0004-authentication-provider.md`;
`packages/database/prisma/migrations/20260810182347_add_password_hash/migration.sql`;
`packages/validation/src/auth.ts`;
`apps/web/src/{auth.config.ts,auth.ts,proxy.ts,types/next-auth.d.ts,app/(auth)/{actions.ts,sign-in-form.tsx,sign-up-form.tsx},app/sign-in/page.tsx,app/sign-up/page.tsx,app/api/auth/[...nextauth]/route.ts}`.

**Files modified**
`packages/database/{prisma/schema.prisma}`;
`packages/validation/{package.json,tsconfig.json,src/index.ts,README.md}`;
`apps/web/{package.json,src/app/layout.tsx,README.md}`; `.env.example`;
`docs/{ADR n/a,ARCHITECTURE.md,SECURITY.md,DATABASE.md,DEVELOPMENT-SETUP.md}`; this file.
`apps/web/AGENTS.md` and `apps/web/CLAUDE.md` were auto-generated by `next dev`/`next build`
itself (Next.js 16's own per-directory agent guidance files, regenerated on every run) —
committed rather than left as permanent uncommitted diffs, per the file's own instruction.

**Files intentionally not committed**
`.env` (gained a real local `AUTH_SECRET`, gitignored, generated for this phase's own
verification — confirmed via `git check-ignore -v`, unchanged from Phase 4's `DATABASE_URL`
handling).

**Known limitations / risks**
- `next-auth@5` is still on a `5.0.0-beta.*` tag (currently `beta.32`) despite roughly two
  years of production use under that tag — a real, ongoing risk, tracked in the ADR rather
  than hidden.
- No password reset / email verification flow — out of scope for "real sign-in" as
  literally requested; would need either an SMTP/email provider decision (its own
  stop-and-ask point) or a manual admin-driven reset, whichever a future phase needs.
- `apps/api` has no session verification / guards yet — it has no protected endpoint to
  guard. Deferred to Phase 6, which is when the first real tenant-scoped API endpoint
  arrives; noted in both the ADR and `docs/ARCHITECTURE.md`.
- Local-only manual verification (one browser session, one dev machine) — no automated
  Playwright/e2e coverage of the sign-in flow yet (`docs/TESTING.md`'s e2e layer isn't wired
  up until a later phase); this phase's confidence comes from the manual browser walkthrough
  above plus the unchanged `packages/database` test suite, not new automated tests.
- Auth provider decision is now closed; **local Redis strategy remains the only open
  decision** in `docs/ARCHITECTURE.md`.

**Next phase**

Phase 6 — Multi-tenancy: `Organization`/`OrganizationMember` already exist from Phase 4;
this phase wires real org creation/membership into the authenticated session (every
tenant-owned query scoped server-side by `organization_id`, never client input — per
`docs/ARCHITECTURE.md`'s multi-tenancy rule), and is the first phase that needs `apps/api`
to actually verify who's calling it. Will not start until the user says to proceed.

## Phase 6 report

**What was built**
- `packages/shared`: scaffolded for real (previously an empty placeholder) —
  `signInternalServiceToken`/`verifyInternalServiceToken` (HS256, `jsonwebtoken`), the
  `apps/web` -> `apps/api` server-to-server auth contract. Full design:
  `docs/ARCHITECTURE.md`'s new "Session verification (Phase 6)" section.
- `packages/validation`: `createOrganizationSchema` (name + slug, slug format rule per
  `docs/DATABASE.md`'s long-standing note that this was "an application-layer concern for
  whichever phase builds org creation").
- `apps/api`: first guarded endpoints — `src/auth/` (`SessionGuard`, `@CurrentUser()`,
  verifies the internal bearer token) and `src/organizations/` (`POST /api/organizations`,
  `GET /api/organizations`, `GET /api/organizations/:id/members`). `listMembers` is the
  first real tenant-isolation enforcement in this codebase: 404 for any org the caller isn't
  a member of, identical response whether the org exists or not. First test suite for
  `apps/api` — Vitest + Supertest against a real `@nestjs/testing` app and the real local
  Postgres, 9 tests covering auth rejection, creation, duplicate-slug conflict, invalid-slug
  rejection, listing, and three tenant-isolation cases.
- `apps/web`: `src/lib/api.ts` (`callApi()` — signs the internal token from the current
  Auth.js session, calls `apps/api`, server-side only); `src/app/onboarding/` (create-
  organization form + server action); `src/app/page.tsx` rewritten to load the caller's
  organizations from `apps/api` and either redirect to `/onboarding` (zero orgs) or show the
  first org's name/slug/role + member list, degrading gracefully if `apps/api` is
  unreachable (same philosophy as `/status`).
- New env var: `API_INTERNAL_SECRET` (`.env.example`, local `.env`) — deliberately separate
  from `AUTH_SECRET`; see the ADR/architecture reasoning on not reusing one key for two
  different cryptographic uses.
- Docs: `docs/ARCHITECTURE.md` ("Session verification (Phase 6)" section, multi-tenancy
  section rewritten, Backend modules note, and a stale `middleware.ts` reference fixed to
  `proxy.ts` while in the file); `docs/API-SPEC.md` (3 new endpoints documented);
  `docs/SECURITY.md` (tenant isolation + AuthN/AuthZ sections extended); `docs/TESTING.md`
  (first real tenant-isolation test example + the `unplugin-swc` note); `docs/DEVELOPMENT-SETUP.md`
  (new Phase 6 section: setup, running `apps/api`'s tests, both bugs found below);
  `apps/api/README.md` and `apps/web/README.md` rewritten; `packages/shared/README.md` and
  `packages/validation/README.md` extended; this file.

**A real regression found and fixed while adding the Express `user` type augmentation**:
adding an `import` to `apps/api/src/common/types/express.d.ts` (to import the
`AuthenticatedUser` interface) silently turned the file from a global ambient script into a
module — TypeScript stopped merging its `declare namespace Express` into the real global
`Express` namespace `@types/express` declares, breaking not just the new `request.user`
property but the *existing* `request.requestId` one too (`nest build` failed with
`Property 'requestId' does not exist on type 'Request'`). Fixed by wrapping the augmentation
in `declare global { namespace Express { ... } }`, the standard pattern once a `.d.ts` file
has any top-level `import`.

**A real, well-known NestJS+Vitest gap found and fixed while building `apps/api`'s first
test suite**: every constructor-injected provider resolved to `undefined` at runtime
(`Cannot read properties of undefined (reading 'create')`) even though `nest build`/
`nest start` worked fine. Cause: Nest's DI resolves constructor parameter types via
TypeScript's `emitDecoratorMetadata`, which Vitest's default esbuild-based transform doesn't
produce. Fixed with NestJS's own documented recipe: `unplugin-swc` + `@swc/core` as a Vite
plugin in `apps/api/vitest.config.ts`.

**Commands executed and results**
| Command | Result |
|---|---|
| `pnpm install` (×2 passes — `jsonwebtoken`, `supertest`/`@nestjs/testing`/`@swc/core`/`unplugin-swc`, workspace links) | Both exit 0. |
| `pnpm --filter @automationdm/shared run build` / `@automationdm/validation run build` | Both `tsc`, exit 0. |
| `pnpm --filter @automationdm/api run build` (1st attempt) | **Failed** — the `express.d.ts` regression above. |
| Same, after the fix | `nest build`, exit 0. |
| `pnpm --filter @automationdm/api run test` (1st attempt) | **7/9 failed** — the Vitest/SWC DI gap above. |
| Same, after adding `unplugin-swc` | **9/9 passed**, including all three tenant-isolation cases. |
| `pnpm --filter @automationdm/web run typecheck` / `run build` | Both passed; route list now includes `/onboarding`. |
| Manual browser test: sign up a fresh user (`carol@example.com`) | Immediately redirected to `/onboarding` (zero orgs) — not a placeholder dashboard. |
| Submit the create-organization form | `201` from `apps/api`, redirected to `/`, dashboard shows "Carol's Widgets", "/carols-widgets — you are owner", member list with Carol as owner. |
| Sign out, sign up a second fresh user (`dave@example.com`) | Also redirected to `/onboarding` — confirmed Dave does **not** see Carol's organization, matching the automated tenant-isolation tests. |
| `.\scripts\lint.ps1` (ESLint + typecheck across all 9 workspace projects + Prettier) | ESLint 0 errors, typecheck 9/9 `Done`, Prettier all pass. Exit 0. |
| `.\scripts\test.ps1` | `packages/database`: 11/11 (unchanged); `apps/api`: 9/9 (new). |
| Full rebuild of all packages/apps after all fixes | All exit 0 again. |
| `node --version` / `npm --version`, fresh shells, throughout | `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — **unchanged**. |

**Files created**
`packages/shared/src/{index.ts,internal-service-token.ts}`;
`packages/validation/src/organization.ts`;
`apps/api/src/auth/{authenticated-user.interface.ts,session.guard.ts,current-user.decorator.ts,auth.module.ts}`,
`apps/api/src/organizations/{organizations.service.ts,organizations.controller.ts,organizations.module.ts,__tests__/organizations.e2e.test.ts}`,
`apps/api/{vitest.config.ts,vitest.setup.ts}`;
`apps/web/src/lib/api.ts`, `apps/web/src/app/onboarding/{page.tsx,create-organization-form.tsx,actions.ts}`.

**Files modified**
`packages/shared/{package.json,tsconfig.json,README.md}`;
`packages/validation/{src/index.ts,README.md}`;
`apps/api/{package.json,src/app.module.ts,src/common/types/express.d.ts,README.md}`;
`apps/web/{package.json,src/app/page.tsx,README.md}`; `.env.example`;
`docs/{ARCHITECTURE.md,API-SPEC.md,SECURITY.md,TESTING.md,DEVELOPMENT-SETUP.md}`; this file.

**Files intentionally not committed**
`.env` (gained a real local `API_INTERNAL_SECRET`, gitignored — confirmed via
`git check-ignore -v`, unchanged handling from every prior phase's secrets).

**Known limitations / risks**
- Dashboard shows only the caller's *first* organization (by `createdAt`) — no org-switcher
  UI. Not required by this phase's roadmap line; a real multi-org UX is deferred until a
  phase that actually needs it.
- No invite-by-email flow — `users`/`members` stay folded into `organizations` until that
  exists. Adding a member today would require direct DB access (there's no endpoint for it
  yet), which is fine since nothing in this phase needed one.
- No role-based *authorization* beyond "is a member" — `OWNER`/`ADMIN`/`MEMBER` exist as
  vocabulary (Phase 4) and are returned by the API, but nothing yet restricts an action to a
  specific role, since no endpoint operates on an *existing* org's data yet (only creates
  new ones and lists membership).
- The internal service token's 60-second expiry and lack of revocation list is appropriate
  for "minted fresh per server-side call, never stored" but has not been load-tested or
  clock-skew-tested across machines; noted, not a blocker for local dev.
- `apps/api`'s new test suite shares the same disposable local dev Postgres as manual
  browser testing and `packages/database`'s tests — running it wipes `users`/
  `organizations`/`organization_members` (by design, see the ADR), which is why the manual
  browser walkthrough above used fresh accounts rather than Phase 5's.
- Local Redis strategy remains the only fully open decision in `docs/ARCHITECTURE.md`.

**Next phase**

The product scope was simplified immediately after this phase — see
`docs/ADR/0005-simplified-mvp-architecture.md` and the "Scope simplification" note above the
checklist. Phase 7 is now: Instagram account domain model + Zernio provider abstraction
(`instagram_accounts` table, org-scoped, no live Zernio calls yet; `InstagramProvider`
interface + `ZernioInstagramProvider` skeleton in `packages/zernio`). Will not start until
the user says to proceed.

## Phase 7 report

**What was built**
- `packages/database`: `InstagramAccount` model + `InstagramAccountStatus` enum
  (`CONNECTED`/`DISCONNECTED`/`ERROR`), one migration
  (`20260810202052_add_instagram_accounts`). `zernioAccountId` is **globally** unique (not
  per-org) — deliberate, so `docs/WEBHOOKS.md`'s future org-resolution-by-account-id lookup
  is always unambiguous. 3 new Vitest tests (create with default status, reject a duplicate
  `zernioAccountId` under a *different* org, cascade delete) — 14/14 total, up from 11.
- `packages/zernio`: scaffolded for real (previously an empty placeholder) —
  `InstagramProvider` interface (`connectAccount` only, matching Phase 8's scope — no
  speculative methods for phases that haven't arrived) and a `ZernioInstagramProvider`
  skeleton whose implementation throws "not implemented yet." No live Zernio call exists
  anywhere in the codebase yet, exactly as this phase's scope requires. Builds to `dist/`
  via `tsc`, same pattern as `packages/database`/`shared`/`validation`.
- Docs: `docs/DATABASE.md` (`InstagramAccount` section with full per-field reasoning,
  matching the `User`/`Organization`/`OrganizationMember` style; conventions section
  extended; migrations list updated); `docs/ARCHITECTURE.md` (Database section, Backend
  modules note, repo layout); `docs/ZERNIO-INTEGRATION.md` (abstraction-boundary diagram
  corrected to drop `apps/worker` — it's inert per ADR 0005 — and a "Status (Phase 7)" note
  added); `packages/zernio/README.md` rewritten; this file.

**No `apps/api` changes this phase** — per `docs/ARCHITECTURE.md`'s "creating an empty
module ahead of the phase that needs it is avoided" rule, no `instagram` NestJS module was
added, since there's no real endpoint to put in it yet (Phase 8's OAuth connect flow is what
needs one). `apps/api`'s build was re-verified anyway, since its Prisma client type surface
changed with the new model.

**Commands executed and results**
| Command | Result |
|---|---|
| `prisma migrate dev --name add_instagram_accounts` | Applied migration, regenerated Prisma Client 6.19.3. Reviewed the generated SQL by hand (one `CREATE TYPE`, one `CREATE TABLE`, one unique index, one plain index, one FK) before proceeding. |
| `pnpm --filter @automationdm/database run build` / `run test` | `tsc` exit 0; **14/14 vitest tests pass** (11 existing + 3 new). |
| `pnpm --filter @automationdm/zernio run build` | `tsc`, exit 0 (first real build — previously an empty placeholder). |
| `pnpm exec eslint packages/zernio` (1st run) | **1 error** — `_input` reported as an unused parameter in the `connectAccount` stub (the sole parameter, with nothing "used" after it to exempt it under the project's default `after-used` lint mode). |
| Fixed by implementing the stub with zero parameters (TypeScript allows a class method to implement an interface method with fewer parameters — any caller passing the full argument list stays compatible) | — |
| `pnpm exec eslint packages/zernio` (2nd run) | 0 errors. |
| `.\scripts\lint.ps1` (ESLint + typecheck across all 10 workspace projects + Prettier) | ESLint 0 errors, typecheck 10/10 `Done`, Prettier all pass. Exit 0. |
| `.\scripts\test.ps1` | `packages/database`: 14/14; `apps/api`: 9/9 (unchanged, confirms the new model didn't regress Phase 6's tenant-isolation tests). |
| Full rebuild of every package/app (`database`, `shared`, `validation`, `zernio`, `api`, `worker`, `web`) | All exit 0. |
| `node --version` / `npm --version`, fresh shell | `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — **unchanged**. |

**Files created**
`packages/database/prisma/migrations/20260810202052_add_instagram_accounts/migration.sql`;
`packages/zernio/src/{index.ts,instagram-provider.ts,zernio-instagram-provider.ts}`.

**Files modified**
`packages/database/{prisma/schema.prisma,src/__tests__/database.test.ts}`;
`packages/zernio/{package.json,tsconfig.json,README.md}`;
`docs/{DATABASE.md,ARCHITECTURE.md,ZERNIO-INTEGRATION.md}`; this file.

**Known limitations / risks**
- `InstagramProvider.connectAccount`'s exact parameters (`code`, `redirectUri`) are a
  generic OAuth-authorization-code shape, not yet verified against Zernio's actual connect
  flow — intentional (the interface is domain-shaped, not Zernio-shaped, per
  `docs/ZERNIO-INTEGRATION.md`'s own design), but the real implementation in Phase 8 must
  still confirm this shape actually fits what Zernio's OAuth flow returns, per `CLAUDE.md`'s
  "never invent Zernio API behavior" rule.
- No `apps/api` endpoint exists yet to create/list `InstagramAccount` rows — nothing is
  reachable from `apps/web` yet. Expected; Phase 8 adds the first one (the OAuth connect
  flow itself).

**Next phase**

Phase 8 — Zernio account connection: real OAuth flow (re-verify the exact flow against
Zernio's live docs first, per `CLAUDE.md`), a NestJS `instagram` module with connect/
callback endpoints, `ZernioInstagramProvider.connectAccount`'s real implementation, and the
first `InstagramAccount` rows ever created outside a test. Will not start until the user
says to proceed.
