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
- [ ] **Phase 4 — PostgreSQL + Prisma** (first migration: `users` groundwork only as auth needs it) — **next phase**
- [ ] Phase 5 — Authentication (Clerk vs Auth.js decision + implementation)
- [ ] Phase 6 — Multi-tenancy (`organizations`, `organization_members`, tenant-isolation tests)
- [ ] Phase 7 — Instagram account domain model (`instagram_accounts` table, no Zernio calls yet)
- [ ] Phase 8 — Zernio provider abstraction (`InstagramProvider` interface + `ZernioInstagramProvider` skeleton)
- [ ] Phase 9 — Zernio account connection (real OAuth flow)
- [ ] Phase 10 — Webhook ingestion (`POST /webhooks/zernio`, `webhook_events`, idempotency)
- [ ] Phase 11 — Redis + BullMQ (queue wiring; `apps/worker`'s bootstrap shell already exists from Phase 2 — this phase adds the actual queue connection and processors; local Postgres/Redis strategy finalized)
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

**Next phase**

Phase 4 — PostgreSQL + Prisma: introduce `packages/database`'s Prisma schema, starting
with only the tables the very next phase (Phase 5, Authentication) actually needs, and
finally resolve the local Postgres/Redis strategy left open since Phase 0
(`docs/ADR/0002-project-local-node-and-no-docker-fallback.md`). Will not start until the
user says to proceed.
