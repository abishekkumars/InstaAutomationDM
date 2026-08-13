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
- [x] Phase 8 — Zernio account connection (real OAuth flow, populates `instagram_accounts`).
  See "Phase 8 report" below.
- [x] Phase 9 — List + view Instagram posts/reels (fetched live from Zernio, not stored in
  Postgres per ADR 0005; page/limit pagination, verified against Zernio's real docs, not
  assumed). See "Phase 9 report" below.
- [x] Phase 10 — Comment automation creation (`Automation` table: one org + one connected
  account + one specific Zernio post/reel + keyword(s) + optional public reply + DM
  message; create form on the post/reel detail page; resolved against Zernio's real docs
  that Zernio executes the match → reply → DM flow server-side, not this project). See
  "Phase 10 report" below.
- [x] Phase 10.1 — UI redesign + responsive layout, plus an org-wide automations list
  (`GET /organizations/:organizationId/automations`, pulled forward from Phase 12's planned
  dashboard/history view because the redesigned dashboard needed it now — see "Phase 10.1
  report" below).
- [x] Phase 10.2 — DM buttons (up to 3, title + link, `automations.buttons` JSON column;
  `packages/zernio`'s `DmButton`; conditional 640-char `dmMessage` cap once buttons are
  attached) — see "Phase 10.2 report" below.
- [x] Phase 10.2a — connect-flow idempotency fix: `ensureProfile` now looks a Zernio profile
  up by name (`GET /v1/profiles?name=`) before creating one, and `POST .../instagram/connect`
  short-circuits when Zernio already reports a connected account instead of re-running OAuth.
  See "Phase 10.2a report" below.
- [x] Phase 10.2b — automation listing/creation fixes + UI pass: automations are now
  reconciled from Zernio (the system of record) instead of read only from our own table; the
  `platformPostId`/`postId` id swap that made created automations unable to fire is corrected;
  the create wizard no longer drops its own fields on submit; plus a light/dark theme switch,
  a fixed app shell with a virtualized/searchable/sortable posts browser, and a global loading
  overlay. See "Phase 10.2b report" below.
- [x] Phase 10.3 — live send/click stats on the dashboard (Zernio's `stats.dmsSent`/
  `linkClicks` from the list endpoint's richer stats shape), plus post thumbnails, search and
  sort on the automations table, and four summary stat cards. See "Phase 10.3 report" below.
- [x] Phase 10.4 — performance: streaming (Suspense + skeletons + error boundary), a parallelized
  post-detail fetch, request-scoped memoization of `auth()`, durable tag-invalidated response
  caching with a 60s TTL, a freshness label, and a bounded Zernio request timeout. Also completes
  the update/delete automation endpoints, whose service methods were missing. See ADR 0006 and
  "Phase 10.4 report" below.
- [ ] **Phase 11 — Webhook ingestion + automation trigger recording** (`POST /webhooks/zernio`,
  `webhook_events` idempotency, in-process — no queue, per ADR 0005; records what Zernio's own
  server-side automation execution reports, per Phase 10's finding that Zernio does the
  matching itself) — **next phase**
- [ ] Phase 12 — Automation status/history (run/status records; the list/detail UI itself
  landed early in Phase 10.1 — this phase is now just the run/status records behind it, the
  MVP's item 13, not a general analytics pipeline)
- [ ] Phase 13 — Security hardening (scoped to this app's actual size — tenant isolation,
  secret hygiene, dependency audit; not enterprise-scale rate limiting/WAF work)
- [ ] Phase 14 — Production deployment. **Partly done ahead of schedule**: the hosting target is
  decided and live (Vercel, two projects, region `bom1`; Supabase PostgreSQL in `ap-south-1`), and
  `docs/DEPLOYMENT.md` now documents the real topology instead of a placeholder. What remains is
  the operational half — DNS, backup/restore, a rollback runbook, and a secret-rotation
  procedure. No Docker/Nginx/Cloudflare requirement, per ADR 0005.

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

## Phase 8 report

**Re-verification against Zernio's live docs (required by `CLAUDE.md` before this phase
started)**: Phase 7's `InstagramProvider.connectAccount(code, redirectUri)` shape — a
generic OAuth-authorization-code exchange — turned out not to match Zernio's real API at
all. Fetched Zernio's live OpenAPI spec (`docs.zernio.com/api/openapi`) and its
`/guides/connecting-accounts` and `/multi-tenant` guides directly rather than trusting the
Phase 0 research pass's general description. Real findings: Zernio has its own tenant-
boundary concept ("profiles" — one per end customer, exactly this project's
Organization-per-tenant model), it hosts the entire OAuth round trip with Instagram/Meta
itself, and it never hands us an authorization code to exchange — by the time it redirects
back to us, the connection already happened server-side on Zernio's end. `InstagramProvider`
was redesigned around three methods that actually match this (`ensureProfile`,
`getConnectUrl`, `findConnectedAccount`) instead of patching the old shape. See
`docs/ZERNIO-INTEGRATION.md`'s "Zernio profiles" and "Account connection" sections for the
full, source-cited detail.

**What was built**
- `packages/database`: `Organization.zernioProfileId` (nullable, globally unique), one
  migration (`20260811021921_add_zernio_profile_id_to_organizations`).
- `packages/validation`: `instagramCallbackSchema` (`profileId`, `accountId`).
- `packages/zernio`: `InstagramProvider` redesigned (see above);
  `ZernioInstagramProvider.ensureProfile`/`getConnectUrl`/`findConnectedAccount` all make
  real HTTP calls to `https://zernio.com/api/v1` (`POST /profiles`, `GET /connect/instagram`,
  `GET /accounts`), with a duplicate-profile-name 409 recovered via the error body's
  `details.existingProfileId` rather than left as a hard failure.
- `apps/api`: new `instagram` module — `InstagramService`/`InstagramController` under
  `organizations/:organizationId/instagram` (`POST .../connect`, `POST .../callback`,
  `GET .../accounts`), all behind `SessionGuard`, same 404-if-not-a-member tenant-isolation
  pattern as `organizations`. `handleCallback` never trusts the OAuth redirect's own query
  params: the `profileId` must match the organization's own `zernioProfileId`, and the
  `accountId` is independently re-confirmed with a live `findConnectedAccount` Zernio call
  before anything is written; a `zernioAccountId` already connected to a *different*
  organization is rejected with `409` (enforced both by an explicit check and, as a race-
  safety net, by catching the underlying `P2002` from the database's own unique constraint).
  `INSTAGRAM_PROVIDER` is a DI token so tests can bind a fake instead of the real
  `ZernioInstagramProvider`. New `src/config/app-url.ts` (`getAppUrl()`) so the OAuth
  `redirect_url` is built from apps/api's own `APP_URL` env var, never a client-supplied
  value.
- `apps/api`: 9 new Vitest + Supertest e2e tests
  (`src/instagram/__tests__/instagram.e2e.test.ts`) against an in-memory
  `FakeInstagramProvider` (never live Zernio, per `docs/TESTING.md`) — connect-url issuance +
  profile-id persistence/reuse, non-member 404, successful callback + DB write, callback
  profile-id mismatch, callback account-id Zernio doesn't confirm, cross-organization account
  conflict, list accounts + non-member 404. 18/18 total with the existing `organizations`
  suite (up from 9).
- `apps/web`: `src/app/instagram/actions.ts` (`connectInstagramAction` — calls the connect
  endpoint, redirects the browser to the real external `authUrl`) and
  `src/app/instagram/callback/page.tsx` (where Zernio redirects the browser back to; still
  behind the normal authenticated-session requirement, forwards the result to the callback
  endpoint, redirects to `/` with a `?instagram=connected|error` banner).
  `src/app/page.tsx` extended: shows a "Connect Instagram" button when the organization has
  no connected account, or the connected `@username`/status list when it does; also dropped
  `Contacts`/`Analytics` from its placeholder-sections array (pre-existing drift from before
  ADR 0005 retired that scope — fixed while already touching this file, per `CLAUDE.md`'s
  "fix the doc/code as part of your change" rule, not a new decision this phase).
- New env var: `APP_URL` (`.env.example`, local `.env`) — apps/api's own view of where
  apps/web is reachable, so the OAuth redirect URL is server-controlled rather than trusted
  from the caller.
- Docs: `docs/ZERNIO-INTEGRATION.md` (Account connection section rewritten with the real,
  verified flow; new "Zernio profiles" section), `docs/DATABASE.md` (`zernioProfileId` field,
  migrations list, `InstagramAccount` status note), `docs/ARCHITECTURE.md` (new "Instagram
  connect flow" section, Backend modules note, repo layout, status line), `docs/API-SPEC.md`
  (3 new endpoints), `docs/SECURITY.md` (the OAuth-redirect trust-boundary consideration),
  `docs/TESTING.md` (status line fixed from a stale "Phase 0 baseline," fake-provider
  pattern documented), `docs/DEVELOPMENT-SETUP.md` (setup + two bugs found, below),
  `apps/api/README.md`, `apps/web/README.md`, `packages/zernio/README.md`, root `README.md`
  (status line was still stuck on Phase 6 — pre-existing drift from before Phase 7, fixed
  here); this file.

**A real test-isolation bug found and fixed while adding this phase's own test file**: with
two `apps/api` e2e test files instead of one, Vitest's default file-level parallelism let
both files' full-table-reset `beforeEach` hooks race against the same real local Postgres,
causing spurious FK/unique-constraint failures in *both* files, including the pre-existing
`organizations` suite. Fixed by setting `fileParallelism: false` in
`apps/api/vitest.config.ts` — the correct fix for a shared-database integration suite, not a
workaround; full detail in `docs/DEVELOPMENT-SETUP.md`.

**A real bug found in the test file itself while first running it**: reassigning a fresh
`FakeInstagramProvider` instance in `beforeEach` silently stopped resetting the actual
provider the NestJS testing module had already bound at `beforeAll` time (Nest resolves a
provider once at module-compile time) — tests that depended on a clean fake state failed
against a stale, never-reset one. Fixed by adding a `reset()` method and calling it on the
same bound instance instead of replacing the variable.

**A real, live credential problem found during manual browser verification, then resolved**:
the `ZERNIO_API_KEY` initially in this project's local `.env` was rejected by Zernio's live
API with `401 Unauthorized` on every call — independently reproduced with a bare `curl` call
carrying the exact same key against both `POST /v1/profiles` and a plain `GET /v1/accounts`,
confirming it wasn't a request-signing bug on our side. The failure path itself worked
exactly as designed regardless — a graceful `?instagram=error` banner on the dashboard, the
full error logged server-side against a `requestId`, no crash. The user generated a new key
and reported it back **without the documented `sk_` prefix**; a `curl` comparison of both
forms against the live API confirmed the prefix is required (`sk_...` → `200`, bare key →
`401`) — `.env` corrected accordingly.

**Full live end-to-end verification, after the key fix**: signed up a fresh test user,
created a new organization, and clicked "Connect Instagram" again.
1. `POST .../instagram/connect` reached the real Zernio API and created a real, new Zernio
   profile for the organization (confirmed via a direct database query — a fresh
   `Organization.zernioProfileId` distinct from any test fixture).
2. The browser was actually redirected all the way to `https://instagram.com`'s real login
   screen — confirming `getConnectUrl`'s `authUrl` is real and the redirect is real. (Stopped
   here, correctly: completing this requires a real Instagram account's own credentials,
   which weren't entered — not something this agent has or should obtain.)
3. To verify the callback path itself against real Zernio data without needing a live Meta
   login, the test organization's `zernioProfileId` was temporarily pointed (via a direct,
   local-only database update) at a Zernio profile in the same account that already had a
   real Instagram account connected from earlier testing (`@explore.with_ruthiiii`). Manually
   navigating to `/instagram/callback` with that profile's real `profileId`/`accountId` (the
   same values a genuine Meta login would have produced) exercised the real production code
   path end to end: `apps/web`'s callback page → the real internal bearer token → `apps/api`'s
   `handleCallback` → a live `GET /v1/accounts` call to Zernio that confirmed the account →
   a real `InstagramAccount` row written to Postgres → the dashboard correctly rendering
   "@explore.with_ruthiiii — connected". Confirmed directly in the database, not just the UI.
4. **Negative case, also against the live API**: retried the callback with a fabricated
   `accountId` for the same real `profileId`. Correctly rejected with the `?instagram=error`
   banner, and the already-connected account was left untouched — proving
   `findConnectedAccount`'s live-confirmation check actually rejects a forged claim rather
   than trusting the request body, using the real Zernio API, not just the fake in the
   automated suite.

Phase 8 is now live-verified, not just test-verified — the only step not literally exercised
is a human completing Meta's own OAuth consent screen, which is outside this agent's
authority to do (see the safety rules around never entering credentials on a user's behalf).

**Commands executed and results**
| Command | Result |
|---|---|
| `prisma migrate diff --from-url ... --to-schema-datamodel ...` then a hand-written migration file + `prisma migrate deploy` | `prisma migrate dev` refused to run non-interactively once there was a unique-constraint warning to confirm; used the diff+deploy path instead (documented in-line in the migration, not a deviation from "always go through a generated migration file" — the file is still Prisma-diff-generated, just applied via `deploy` instead of `dev`). Applied cleanly; `prisma migrate status` confirms "up to date." |
| `pnpm --filter @automationdm/zernio run build` / `pnpm exec eslint packages/zernio` | Both clean after adding `@types/node` as a devDependency (needed for global `fetch`/`URLSearchParams` types — `packages/zernio` had no devDependencies before this phase). |
| `pnpm --filter @automationdm/api run build` | `nest build`, exit 0. |
| `pnpm --filter @automationdm/api run test` (1st attempt, 2 e2e files) | **10 failed / 8 passed** — the Vitest file-parallelism cross-file interference above. |
| Same, after `fileParallelism: false` | **4 failed / 14 passed** — the `FakeInstagramProvider` reset bug above. |
| Same, after the `reset()` fix | **18/18 passed.** |
| `.\scripts\lint.ps1` (ESLint + typecheck across all 10 workspace projects + Prettier) | ESLint 0 errors, typecheck 10/10 `Done`, Prettier flagged 3 newly-written files, fixed via `pnpm run format`, re-verified clean. |
| `.\scripts\test.ps1` | `packages/database`: 14/14 (unchanged); `apps/api`: 18/18 (9 existing + 9 new). |
| Full rebuild of every package/app | All exit 0. |
| Manual browser test (1st attempt, before the key fix) | Reached the real Zernio API for real, but failed with `401 Unauthorized` — see the credential problem above. |
| Manual browser test (after the key fix): sign up, create an org, click "Connect Instagram" | Real Zernio profile created, real redirect to `instagram.com`'s login screen. |
| Manual verification of the callback path against real, already-connected Zernio data (see above) | Real `InstagramAccount` row written and correctly displayed; a forged `accountId` for the same real `profileId` correctly rejected. |
| `node --version` / `npm --version`, fresh shell, throughout | `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — **unchanged**. |

**Files created**
`packages/database/prisma/migrations/20260811021921_add_zernio_profile_id_to_organizations/migration.sql`;
`packages/validation/src/instagram.ts`;
`apps/api/src/instagram/{instagram-provider.token.ts,instagram.service.ts,instagram.controller.ts,instagram.module.ts,__tests__/instagram.e2e.test.ts}`;
`apps/api/src/config/app-url.ts`;
`apps/web/src/app/instagram/{actions.ts,callback/page.tsx}`.

**Files modified**
`packages/database/prisma/schema.prisma`;
`packages/zernio/{package.json,src/instagram-provider.ts,src/zernio-instagram-provider.ts,README.md}`;
`apps/api/{package.json,src/app.module.ts,vitest.config.ts,README.md}`;
`apps/web/src/app/page.tsx`; `.env.example`;
`docs/{ZERNIO-INTEGRATION.md,DATABASE.md,ARCHITECTURE.md,API-SPEC.md,SECURITY.md,TESTING.md,DEVELOPMENT-SETUP.md}`;
root `README.md`; this file.

**Files intentionally not committed**
`.env` (gained `APP_URL` and the user-provided `ZERNIO_API_KEY`, gitignored — confirmed via
`git check-ignore -v`, unchanged handling from every prior phase's secrets).

**Known limitations / risks**
- The full OAuth consent screen (a human logging into a real Instagram account through
  Meta's own UI) was not exercised by this agent, correctly — that requires real Instagram
  credentials, which weren't provided and shouldn't be entered on the user's behalf. Every
  other step of the flow, including the callback's live-Zernio-confirmation logic, was
  verified against the real API using an already-connected real account.
- `loginMethod=facebook_login` (Facebook Page selection) is not implemented — only the
  default `instagram_login` flow, which has no secondary-selection step and covers this
  project's actual scope (users connecting their own Instagram Business/Creator account
  directly). Deferred until a concrete requirement appears, per this project's usual
  practice of not building ahead of need.
- `apps/web`'s connect UI does not yet warn the user that only Business/Creator Instagram
  accounts can be connected before they attempt to connect a personal one — Zernio's own
  OAuth flow will presumably reject or misbehave for a personal account, but this project
  hasn't observed that failure mode directly (blocked on the same API key issue). Surfacing
  a proactive warning is a small follow-up, not deferred to a future phase's scope.
- No rate-limit/retry handling in `ZernioInstagramProvider` — unchanged from Phase 7's
  status, still low priority at this project's actual call volume (<1,000/month), and
  Zernio's real rate limits are still undocumented in the pages reviewed so far.

**Post-phase bug report (2026-08-11): `Organization.zernioProfileId` not being inserted**

Before starting Phase 9, the user reported that running the project locally and clicking
"Connect Instagram" left `zernio_profile_id` `null` in the database. Investigated by
reproducing the flow live rather than guessing:

- Queried the local database directly: exactly one organization (`test-profile`, the user's
  real one) existed with `zernioProfileId: null`.
- Started `apps/api`/`apps/web` fresh (project-local tooling, `.env`'s corrected
  `sk_`-prefixed `ZERNIO_API_KEY` from the Phase 8 fix already in place) and reproduced the
  connect flow end to end with a disposable test organization: `ensureProfile`,
  `getConnectUrl`, and the `Organization.zernioProfileId` database write all worked
  correctly — a real Zernio profile was created and the browser reached Instagram's real
  login screen.
- While this was running, the user's own browser session (already pointed at
  `localhost:3000`) independently retried the same flow for their real `test-profile`
  organization against these same freshly-started servers — and it succeeded, writing a real
  `zernioProfileId`. Confirmed directly in the database afterward: both organizations now
  have one.

**Conclusion**: `InstagramService.createConnectUrl` and `ZernioInstagramProvider` are not
buggy — verified working correctly against the live API. The reported symptom is consistent
with `apps/api` not having been reachable (not running, or not yet started) during the
user's original attempt: a failed `fetch()` in `connectInstagramAction` and any other
`callApi()` failure in the Instagram connect/callback flow were being caught and silently
turned into a generic `?instagram=error` banner with **no server-side log line at all** —
unlike every other Server Action in this codebase (`(auth)/actions.ts`,
`onboarding/actions.ts`), which either surfaces the `ApiError` message or rethrows. This
silent-failure gap is what actually made the bug unactionable — there was nothing to look at
to find the real cause.

**Fix**: `apps/web/src/app/instagram/actions.ts`'s `connectInstagramAction` and
`apps/web/src/app/instagram/callback/page.tsx` now `console.error` the caught error (with
context) before redirecting to the error banner, matching this codebase's existing
error-visibility convention elsewhere. This doesn't change working behavior — it ensures the
next time this flow fails for any reason (`apps/api` down, an expired/invalid
`ZERNIO_API_KEY`, a stale organization membership), the real cause is visible in `apps/web`'s
terminal output instead of being a dead end.

Re-verified after the fix: `.\scripts\lint.ps1` (ESLint, typecheck across all 10 workspace
projects, Prettier) all clean; manual browser retest of the full connect flow on a fresh org
still reaches Instagram's real login screen with no regression.

## Phase 9 report

**Re-verification against Zernio's live docs (required by `CLAUDE.md` before this phase
started)**: fetched Zernio's live OpenAPI spec (`docs.zernio.com/api/openapi`) again — the
Phase 0 research pass never found a posts/media listing endpoint for Instagram at all. Real
findings: it's `GET /v1/posts`, a cross-platform "publishing" endpoint (`x-resource-group:
publishing`), not an Instagram-specific one — its `source` query param picks between
Zernio-authored content (`zernio`, a feature this project has none of) and content synced in
from the platform itself (`external`, which is what "list an account's existing posts/reels"
actually means). Pagination is **page/limit-based**, not cursor-based — the Phase 0
placeholder's "verify cursor vs offset, don't assume" note is resolved: it's plain
`page`/`limit`, echoed back in the response as `{ page, limit, total, pages }`. Full detail:
`docs/ZERNIO-INTEGRATION.md`'s "Listing posts/reels" section.

**What was built**
- `packages/zernio`: `InstagramProvider.listPosts`/`getPost` + domain type `InstagramPost`
  (`zernioPostId`, `zernioAccountId`, `platformPostId`, `permalink`, `caption`, `mediaType`,
  `thumbnailUrl`, `publishedAt`). `ZernioInstagramProvider.listPosts` calls
  `GET /v1/posts?source=external&accountId&profileId&platform=instagram&page&limit`;
  `getPost` does **not** call `GET /v1/posts/{postId}` (see the live-testing finding below) —
  it searches a `listPosts` call instead.
- `packages/validation`: `listInstagramPostsQuerySchema` (`page` ≥1 default 1, `limit` 1-500
  default 10 — mirrors Zernio's own bounds, rejects rather than clamps an over-limit value).
- `apps/api`: `InstagramService.listPosts`/`getPost` + two new `InstagramController` routes
  (`GET .../instagram/accounts/:accountId/posts`, `.../posts/:postId`), both behind
  `SessionGuard`, both 404-if-not-a-member **and** 404-if-`:accountId`-not-owned-by-this-org
  (new `requireOwnAccount` helper, same 404-not-403 pattern as the rest of this module).
- `apps/api`: 6 new Vitest + Supertest e2e tests (list + pagination passthrough, over-limit
  rejection, cross-org account-id 404, single-post fetch, cross-org post 404 even with a
  correctly-guessed id, unknown-post 404) — 24/24 total with the existing suites.
- `apps/web`: `src/app/instagram/posts/page.tsx` (list, thumbnail grid, prev/next
  pagination) and `src/app/instagram/posts/[postId]/page.tsx` (detail: full media, caption,
  published date, a "View on Instagram" link to the real permalink). Dashboard
  (`src/app/page.tsx`) gained a "View posts" link per connected account.
- Docs: `docs/ZERNIO-INTEGRATION.md` ("Listing posts/reels" section rewritten with the real,
  verified endpoint and the `getPost` workaround), `docs/API-SPEC.md` (2 new endpoints),
  `docs/ARCHITECTURE.md` (new "Listing Instagram posts/reels" flow section, Backend modules
  note, status line), `docs/DATABASE.md` (status line — no schema change this phase, and
  why), `apps/api/README.md`, `apps/web/README.md`, `packages/zernio/README.md`, root
  `README.md`, this file.

**A real Zernio API gap found via live testing, not assumed**: `GET /v1/posts/{postId}`
returns `{"error":"Post not found",...}` for a `postId` taken directly from a real
`listPosts` response — confirmed with a bare `curl` call using the exact same id, with and
without `profileId`/`source` query params added. This endpoint simply does not support
`source: external` (synced) posts, which is every post this project's use case needs a
detail view for. Caught during manual browser verification (the detail page 404'd on a real,
just-listed post) rather than left undiscovered by only testing against the fake provider.
**Fix**: `ZernioInstagramProvider.getPost` searches a `listPosts` call (`limit: 500`, Zernio's
own max) for the matching id instead of calling the single-post endpoint at all — verified
this covers a real test account's full synced history (46 total posts, well under 500).
`GetPostInput` grew `zernioProfileId`/`zernioAccountId` accordingly (from just a bare post
id), and `InstagramProvider`'s doc comments record the finding so a future reader doesn't
reintroduce the original approach.

**A real tenant-isolation gap found and closed before it shipped, not after**: unlike
`listPosts` (which Zernio itself scopes via the `accountId` query param), a bare
`GET /v1/posts/{postId}`-style lookup would be scoped only by this project's single, org-wide
`ZERNIO_API_KEY` — nothing would stop an authenticated member of *any* organization from
reading *any* other organization's post by guessing/enumerating its `zernioPostId`. Closed
two ways: `getPost`'s own implementation only ever searches within an already
accountId-scoped `listPosts` call (structurally can't return a foreign post), and
`InstagramService.getPost` independently re-checks the returned post's `zernioAccountId`
against the account the caller actually asked about before returning it anyway — defense in
depth, the same discipline as the callback handler's live re-confirmation in Phase 8. Covered
by an e2e test using a *forged, correctly-guessed* post id across two real organizations.

**Full live end-to-end verification**: signed up two fresh test users, each created an
organization, and repeated the connect flow (real Zernio profile creation, real redirect to
`instagram.com`'s login screen — stopped there correctly, no credentials entered). To
exercise the posts-listing flow against real data without a live Meta login, each test
organization's `zernioProfileId` was pointed (via a direct, local-only database update, same
technique as Phase 8's verification) at a Zernio profile with a real, already-connected
Instagram account (`@explore.with_ruthiiii`) and its callback invoked directly with that
account's real ids. Result: the dashboard's "View posts" link, the posts list page (real
captions/thumbnails/media types/dates, 46 real posts across 5 pages, `page`/`limit`
navigation working), and the post detail page (full media, caption, published date, working
"View on Instagram" permalink) all rendered real data end to end — including the specific
post that had originally 404'd before the `getPost` fix above, re-verified working after it.

**Commands executed and results**
| Command | Result |
|---|---|
| `pnpm --filter @automationdm/zernio --filter @automationdm/validation run build` | Both `tsc`, exit 0 — needed before `apps/api`'s typecheck could see the new exports. |
| `.\scripts\lint.ps1` (ESLint + typecheck across all 10 workspace projects + Prettier) | Clean after the `getPost` fix; one earlier round caught 3 files' formatting, fixed via `pnpm run format`. |
| `.\scripts\pnpm.ps1 --filter @automationdm/api run test` (twice: once before, once after the `getPost` fix) | **24/24 passed** both times (15 instagram + 9 organizations) — the `getPost` bug was real-API-only, invisible to the fake-provider suite by construction (the fake never modeled `GET /v1/posts/{postId}`'s actual failure mode), which is exactly why the manual live-browser verification below caught it and the automated suite didn't. |
| `pnpm --filter @automationdm/api run build` | `nest build`, exit 0. |
| Manual browser test: 2 fresh users/orgs, connect flow, DB-repoint + callback technique, posts list + detail pages | All real data, all pagination, all working — see above. First attempt at the detail page 404'd (the `getPost` bug); re-verified working after the fix. |
| `curl` directly against `GET /v1/posts/{postId}` (with and without `profileId`/`source`) | Confirmed the API gap independently of this project's own code — `{"error":"Post not found",...}` every time, for a real id. |
| `node --version` / `npm --version`, fresh shell | `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — unchanged. |

**Files created**
`packages/validation/src/instagram.ts` (extended, not new);
`apps/web/src/app/instagram/posts/{page.tsx,[postId]/page.tsx}`.

**Files modified**
`packages/zernio/src/{instagram-provider.ts,zernio-instagram-provider.ts}`;
`apps/api/src/instagram/{instagram.service.ts,instagram.controller.ts,__tests__/instagram.e2e.test.ts}`;
`apps/web/src/app/page.tsx`;
`docs/{ZERNIO-INTEGRATION.md,API-SPEC.md,ARCHITECTURE.md,DATABASE.md}`;
`apps/api/README.md`; `apps/web/README.md`; `packages/zernio/README.md`; root `README.md`;
this file.

**Known limitations / risks**
- `getPost`'s `listPosts`-search fallback is bounded by Zernio's own max `limit` (500) in a
  single call, not an unbounded page-walk. This covers every account size actually observed
  (a real test account: 46 total synced posts) and this project's actual scale (<1,000 API
  calls/month, 3-4 users), but an account with more than 500 posts in its ~12-month synced
  window would have `getPost` miss items past that cutoff. Not addressed now — no real
  account at this project's scale is anywhere close to that volume, and Zernio's API gives no
  better mechanism to reach for.
- No "attach an automation to this post" action exists yet on the detail page — correctly
  deferred to Phase 10, which is what actually needs it.
- The known Phase 8 limitations (no Facebook-Login connect variant, no personal-account
  warning, no Zernio rate-limit handling) are unchanged by this phase.

## Phase 10 report

**Re-verification against Zernio's live docs (required by `CLAUDE.md` before this phase
started)**: fetched Zernio's live OpenAPI spec again for `POST/GET/PATCH/DELETE
/v1/comment-automations[/{automationId}]`. This resolves `docs/AUTOMATION-ENGINE.md`'s "Open
question" for real: the endpoint's own description is *"Set up keyword triggers on
Instagram/Facebook so commenters automatically receive a DM"* — Zernio executes the entire
keyword-match → public-reply → DM flow server-side once an automation is created. This
project's code never re-implements that matching; `packages/automation-engine` (planned in
the original design) was never built as a result — see `docs/AUTOMATION-ENGINE.md`. The spec
also confirmed `keywords` is a real `string[]` field, matching the user's explicit
requirement ("keywords is not a single, need to add multiple") — this was already the
project's intended model (`docs/AUTOMATION-ENGINE.md`'s "one keyword, or a short list of
keywords"), and Zernio's real API agrees.

**What was built**
- `packages/database`: `Automation` table (`organizationId`, `instagramAccountId`,
  `zernioAutomationId` unique, `zernioPostId`, `name`, `keywords: String[]`, `matchMode`
  enum, `commentReply` nullable, `dmMessage`, `isActive`,
  `@@unique([instagramAccountId, zernioPostId])`), one migration
  (`20260811171420_add_automations_table`).
- `packages/validation`: `createAutomationSchema` (`keywords` array, 1-50 items, required;
  `matchMode` enum default `contains`; `commentReply` optional; `dmMessage` required, ≤1000
  chars).
- `packages/zernio`: `InstagramProvider.createCommentAutomation`; `ZernioApiError` is now
  exported (was package-private) so `apps/api` can map its `status` to the right HTTP error;
  `ZernioInstagramProvider.createCommentAutomation` calls the real
  `POST /v1/comment-automations`.
- `apps/api`: new `automations` module (`AutomationsService`/`AutomationsController`) mounted
  under `organizations/:organizationId/instagram/accounts/:accountId/posts/:postId/automations`
  (`GET` list, `POST` create), behind `SessionGuard`, same 404-tenant-isolation pattern as
  `instagram`. `InstagramModule` now `exports` its `INSTAGRAM_PROVIDER` binding so
  `AutomationsModule` reuses the same `ZernioInstagramProvider` instance rather than creating
  a second one. `create` enforces "one automation per post" at two layers: a local
  `Automation` pre-check, and a `Prisma` `P2002` catch for the race between that check and
  the insert (mirroring the callback handler's Phase 8 defense-in-depth) - plus Zernio's own
  `409` mapped to the same `ConflictException` for the case where Zernio already has an
  automation for this post that our own database never learned about (e.g. created directly
  in Zernio's dashboard).
- `apps/api`: 9 new Vitest + Supertest e2e tests
  (`src/automations/__tests__/automations.e2e.test.ts`) against an in-memory
  `FakeInstagramProvider` — no bearer token (401), non-member (404), cross-org accountId
  (404), **creating an automation with multiple keywords and confirming they persist
  correctly** (the specific scenario the user flagged), rejecting empty keywords (400),
  rejecting a duplicate per-post automation via the local pre-check (409), rejecting when
  Zernio already has one our database doesn't know about (409, and confirms nothing was
  written locally), listing (empty array, then the created automation, 404 for non-member).
  33/33 total with the existing `instagram`/`organizations` suites (up from 24).
- `apps/web`: the post detail page (`src/app/instagram/posts/[postId]/page.tsx`) now fetches
  any existing automation for the post and either displays it (name, keywords, match mode,
  optional public reply, DM message, active status) or renders a create form; new
  `[postId]/actions.ts`'s `createAutomationAction`. Keywords are entered as a single
  comma-separated text field (this app has no client-side interactive form components yet —
  every form so far is a plain server action — so a comma-separated field is the simplest way
  to accept multiple keywords without introducing one), split into the array the API expects
  before sending.
- Docs: `docs/AUTOMATION-ENGINE.md` (rewritten — "Open question" replaced with "Resolved",
  execution-flow section rewritten to describe Zernio's own server-side flow instead of a
  local-matching design that was never needed), `docs/ZERNIO-INTEGRATION.md`
  ("Comment-to-DM automation API" section rewritten with the real, verified endpoint
  behavior), `docs/DATABASE.md` (`Automation` model documented, migrations list, conceptual
  table removed), `docs/API-SPEC.md` (2 new endpoints), `docs/ARCHITECTURE.md` (new "Comment
  automation creation" flow section, Backend modules note, status line), `apps/api/README.md`,
  `apps/web/README.md`, `packages/zernio/README.md`, root `README.md`, this file.

**A live-API investigation followed by a deliberate scope decision**: the user's explicit
ask ("keywords is not a single, need to add multiple") was already the project's intended
design per `docs/AUTOMATION-ENGINE.md` and is now implemented end to end as a `string[]` at
every layer (Prisma column, validation schema, `InstagramProvider` input type, the web
form). Full manual browser verification of the *create* path against the real live Zernio
API (as done for every prior phase) was **not** performed this phase, deliberately: unlike
Phases 8/9's read-only verification calls, creating a real comment-automation on the
already-connected real Instagram account used for prior testing would start an ongoing,
live behavior change - Zernio would begin actually replying to and DMing real commenters on
that real account for as long as the automation stayed active. That is a materially
different risk profile from a one-time read call, and not something to do unilaterally
against a real third-party-facing account without explicit confirmation. Verification for
this phase instead rests on the automated suite (33/33, including the exact multi-keyword
creation scenario against a fake provider that exercises the real request/response mapping
code) plus the live-verified *shape* of the real API (fetched fresh from Zernio's OpenAPI
spec, not assumed). **If live end-to-end confirmation is wanted**, the safe way to get it is
a scoped test: create one automation with an inert, unlikely-to-trigger keyword and a
harmless DM message, confirm it via `GET /v1/comment-automations`, then immediately `DELETE`
it (Zernio supports this) - not done automatically here, pending the user's go-ahead.

**Commands executed and results**
| Command | Result |
|---|---|
| `prisma migrate diff --from-url ... --to-schema-datamodel ...` then a hand-written migration file + `prisma migrate deploy` | `prisma migrate dev` hung waiting on an interactive migration-name prompt (a `pnpm run migrate:dev -- --name ...` passthrough quirk, not a real blocker) and was killed; the diff+deploy path (same technique as Phase 8) applied cleanly. |
| `prisma generate` | Failed twice with `EPERM` renaming the native query-engine binary - a stale `apps/api` dev process (started earlier this session, not from this phase's own work) and, unexpectedly, the running `apps/web` dev server both had it loaded in memory. Stopped both dev processes; `generate` then succeeded. |
| `pnpm --filter @automationdm/zernio run build` / `pnpm --filter @automationdm/validation run build` | Both `tsc`, exit 0 - needed before `apps/api`'s typecheck could see the new exports. |
| `.\scripts\lint.ps1` (ESLint + typecheck across all 10 workspace projects + Prettier) | Clean; two rounds caught unused imports/an unused param in the new test file (fixed) and Prettier formatting on 3-4 newly-written files each round (fixed via `pnpm run format`). |
| `.\scripts\pnpm.ps1 --filter @automationdm/api run test` | **33/33 passed** (15 instagram + 9 automations + 9 organizations). |
| `pnpm --filter @automationdm/api run build` | `nest build`, exit 0. |
| `node --version` / `npm --version`, fresh shell | `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — unchanged. |

**Files created**
`packages/database/prisma/migrations/20260811171420_add_automations_table/migration.sql`;
`packages/validation/src/automation.ts`;
`apps/api/src/automations/{automations.service.ts,automations.controller.ts,automations.module.ts,__tests__/automations.e2e.test.ts}`;
`apps/web/src/app/instagram/posts/[postId]/actions.ts`.

**Files modified**
`packages/database/prisma/schema.prisma`;
`packages/validation/src/index.ts`;
`packages/zernio/src/{instagram-provider.ts,zernio-instagram-provider.ts}`;
`apps/api/src/{app.module.ts,instagram/instagram.module.ts,instagram/__tests__/instagram.e2e.test.ts}`;
`apps/web/src/app/instagram/posts/[postId]/page.tsx`;
`docs/{AUTOMATION-ENGINE.md,ZERNIO-INTEGRATION.md,DATABASE.md,API-SPEC.md,ARCHITECTURE.md}`;
`apps/api/README.md`; `apps/web/README.md`; `packages/zernio/README.md`; root `README.md`;
this file.

**Known limitations / risks**
- No edit/delete/toggle-active UI — Phase 10 is scoped to "comment automation **creation**"
  per the roadmap; Zernio's `PATCH`/`DELETE /v1/comment-automations/{id}` are documented
  (`docs/ZERNIO-INTEGRATION.md`) but not wired up. A future phase adds this if a real need
  appears.
- `getPost`'s `listPosts`-search fallback is bounded by Zernio's own max `limit` (500) in a
  single call - see Phase 9's report for the same limitation (unchanged this phase, since
  `Automation` creation itself doesn't call `getPost`/`listPosts` at all).
- Full live end-to-end verification of the create path against the real Zernio API was
  deliberately not performed this phase - see the risk discussion above.
- `story_reply` trigger, DM buttons/templates, `audience`/`followGate`, delay/variation
  fields, and account-wide (no `platformPostId`) automations are all real Zernio features
  documented in `docs/ZERNIO-INTEGRATION.md` but not built - out of this phase's scope, not
  silently dropped.

**Next phase**

Phase 10.1 (UI redesign) landed next - see its report below - followed by Phase 11.

## Phase 10.1 report

**What/why**: the user supplied real reference screenshots (a comparable Instagram
comment-automation product) and asked for the same visual system - dark sidebar shell, pill
tabs, stat-card row, table-style automation list, chip-style keyword input - applied to this
app's real pages, verified via a mockup artifact before any code changed. Two things the
mockup surfaced turned into real, verified scope for this phase:

- **DM buttons and click/send tracking are real Zernio fields** (`buttons` on
  `POST/PATCH /v1/comment-automations`, up to 3, each `{type: url, title, url}`; `stats`
  includes `dmsSent`/`triggered` on every list/get response, plus `linkClicks`/`uniqueClicks`
  when `linkTracking` - on by default - wraps a button's link). Re-verified live against
  Zernio's OpenAPI spec, not assumed. **Not built this phase** - see "Known limitations"
  below; documented here because the mockup shown to the user included them and the docs
  needed correcting either way (`docs/ZERNIO-INTEGRATION.md` previously listed `buttons` as
  "not used by this project," which stops being true once a later phase builds it).
- **The dashboard table needs to list automations across every account in an org, not just
  one post.** No such endpoint existed - `AutomationsService` only had `listForPost`. This
  is exactly what `docs/DATABASE.md`'s `Automation.organizationId` index was already
  described as being for ("a future dashboard/history view - Phase 12"). Pulled that slice
  of Phase 12 forward rather than build a redesigned dashboard with nothing to show - see
  "Known limitations" for what's still deferred.

**What changed**
- `apps/api/src/automations/automations.service.ts` - added `listForOrganization` (org-wide,
  tenant-checked, includes each automation's connected-account username).
- `apps/api/src/automations/automations.controller.ts` - added `OrganizationAutomationsController`
  (`GET /organizations/:organizationId/automations`) - a separate controller class, not a
  second method on the existing one, because the route has no `accountId`/`postId` segment.
- `apps/api/src/automations/automations.module.ts` - registered the new controller.
- `apps/api/src/automations/__tests__/automations.e2e.test.ts` - new test suite for the
  list-for-organization endpoint (auth, tenant isolation, cross-account aggregation, newest
  first).
- `apps/web/src/app/globals.css` - new `@theme` color tokens (ink/canvas/accent/success/
  danger/muted, light + dark via `prefers-color-scheme`) - Tailwind v4 turns each into
  matching utilities automatically.
- `apps/web/src/app/layout.tsx` - replaced the top-header shell with a responsive sidebar
  (collapses to a horizontal top bar under `md:`) for authenticated pages; unauthenticated
  pages (sign-in/sign-up) keep a simple centered shell, not the sidebar, since there's no
  org/session to show in it yet.
- `apps/web/src/app/page.tsx` - dashboard rebuilt around the new automations table (real
  data from `listForOrganization`, table on wider screens, stacked cards on narrow ones -
  same markup, no separate mobile view to keep in sync); stat row shows only counts this
  app can actually derive today (active/total automations, connected accounts) - the
  reference's "DMs sent"/"followers gained" cards are not here because there is no tracking
  behind them yet (see "Known limitations"). The org-members list from Phase 6 stays -
  restyled, not dropped.
- `apps/web/src/app/instagram/posts/page.tsx`, `.../[postId]/page.tsx` - restyled with the
  same tokens; `[postId]`'s automation-summary view now shows keyword/status as chips/pills.
- `apps/web/src/app/instagram/posts/[postId]/keywords-field.tsx` (new) - a small client
  component: chip-style multi-keyword input with add/remove, syncing to a hidden
  comma-joined field so the existing server action's parsing (`actions.ts`, unchanged) keeps
  working. The one client component in this app's form flow - every other form is still a
  plain server action + `FormData`, per the convention `actions.ts`'s own comment described;
  a chip input specifically needs client interactivity to add/remove without a page reload.
- `apps/web/src/app/(auth)/sign-in-form.tsx`, `sign-up-form.tsx`,
  `onboarding/create-organization-form.tsx`, and their page wrappers - swapped hardcoded
  `slate-*` colors for the new tokens. Not part of the original ask, but the new dark-mode
  tokens flip the page background globally via `prefers-color-scheme`, and these forms'
  hardcoded light-mode text colors became unreadable against a dark background - a real
  regression caught and fixed during this phase's own browser verification, not shipped.

**Verification actually performed**
- `scripts/lint.ps1` (eslint + typecheck + prettier) and `scripts/test.ps1` - both clean;
  51 tests passing (14 `packages/database`, 37 `apps/api`, including the new org-list suite).
- Browser-verified in the running dev server at both desktop and mobile (375px) widths:
  sign-in/sign-up/onboarding forms, the dashboard (seeded with a fake, non-Zernio
  `InstagramAccount`/`Automation` row so the table had real API-shaped data to render
  without touching any live external Instagram account), and the post-detail error state.
  The `KeywordsField` chip component was verified via a throwaway route (deleted after) with
  a scripted DOM interaction, since the Browser pane's click/screenshot pipeline was
  intermittently unresponsive this session - confirmed the chip renders and the hidden field
  holds the joined value, not just that the code compiles.
- Did **not** perform a live Instagram connect / real Zernio call this phase - unlike
  Phases 8-9's live verification, every fact this phase relied on (DmButton shape, stats
  shape, dmMessage length caps) was re-confirmed directly against Zernio's live OpenAPI spec
  fetched fresh, not against a live create call, since this phase built no new Zernio
  request path (buttons/stats are deferred - see below).

**Known limitations / risks**
- **DM buttons and live send/click stats are not built** - the mockup shown to the user
  included them (with the analytics question explicitly asked and answered), but this phase
  scoped down to the UI/redesign + list-endpoint work only, per "don't build multiple
  phases' worth of feature in one shot." They're the next two pieces of work (tracked as
  Phase 10.2/10.3, or folded into whichever phase number is live when they land).
- The dashboard's automations table has no thumbnail/caption per row (unlike the reference) -
  post content is deliberately never cached locally (ADR 0005), and fetching each row's post
  from Zernio individually would be an N+1 call pattern on every dashboard load; a "View"
  link to the post detail page (which already fetches the one post it needs) was used
  instead.
- No edit/rename/pause/duplicate/delete row actions - same reason as Phase 10's report:
  Zernio's `PATCH`/`DELETE` exist but aren't wired up yet.
- Sign-in/sign-up/onboarding got only a contrast fix, not a full restyle to match the
  dashboard's card language - out of scope for a UI phase framed around "the dashboard,"
  fixed only because the new dark-mode tokens broke their existing contrast.

**Next phase**

Phase 10.2 (DM buttons) landed next - see its report below - followed by Phase 10.3 (live
stats), then Phase 11.

## Phase 10.2 report

**What/why**: the first of the two items Phase 10.1 deferred. The user asked for DM buttons
specifically (up to 3, title + link) while reviewing the redesign mockup, and asked whether
DMs-sent/button-click tracking was real - answering that required re-verifying Zernio's live
OpenAPI spec, which is where `buttons`, `linkTracking`, and the list endpoint's richer `stats`
shape (documented in Phase 10.1's report) were confirmed as real, buildable fields. This
phase builds the buttons half; live stats (Phase 10.3) is a separate, smaller phase since it
needs no schema change, just a new provider method and a UI surface.

**What changed**
- `packages/database/prisma/schema.prisma` - added `Automation.buttons` (`Json?`).
- `packages/database/prisma/migrations/20260812090000_add_automation_buttons/` (new) -
  additive `ALTER TABLE ... ADD COLUMN "buttons" JSONB`, generated via
  `prisma migrate diff --script` and applied with `migrate deploy` (the same
  interactive-prompt workaround as every prior phase's migration - see
  `docs/DEVELOPMENT-SETUP.md`). Regenerating the Prisma client hit the same Windows
  query-engine file-lock issue Phase 10 already documented - the currently-running `apps/web`
  and `apps/api` dev processes (not this phase's own tooling) had the old `.dll.node` loaded;
  stopped both, ran `prisma generate`, restarted `apps/web` for browser verification.
- `packages/validation/src/automation.ts` - added `automationButtonSchema` (`title` ≤20
  chars, `url` must be a valid URL) and `buttons` (max 3) to `createAutomationSchema`, plus a
  `.refine()` enforcing the 640-char `dmMessage` cap only when `buttons` is non-empty (can't
  be a plain per-field `.max()`, since the real limit depends on a sibling field).
- `packages/zernio/src/instagram-provider.ts` - added the `DmButton` domain type
  (`{title, url}` only - `type` isn't part of it, since this project only ever sends
  `type: "url"`) and `buttons`/`CommentAutomation.buttons` to the create input/response
  shapes.
- `packages/zernio/src/zernio-instagram-provider.ts` - `createCommentAutomation` now sends
  `buttons` (mapped to Zernio's real `{type: "url", title, url}` shape) when present, omitted
  entirely otherwise; the response mapper reads `buttons` back, filtering to `type: "url"`
  items with both a `title` and `url` (defensive, even though Zernio will only ever echo back
  what this project itself sent).
- `apps/api/src/automations/automations.service.ts` - `AutomationSummary`/`AutomationButton`
  gained `buttons`; `create()` passes `parsed.buttons` through to the provider and persists
  `created.buttons` as the new JSON column (cast to `Prisma.InputJsonValue` - an array of a
  named interface doesn't structurally satisfy Prisma's `InputJsonObject` index signature
  even though the values are plain JSON-safe objects); `toSummary()` gained a `toButtons()`
  helper that narrows the column's type-erased `Prisma.JsonValue` back to `{title,url}[]`
  rather than trusting it as-is.
- `apps/api/src/automations/__tests__/automations.e2e.test.ts`,
  `apps/api/src/instagram/__tests__/instagram.e2e.test.ts` - `FakeInstagramProvider`'s
  `createCommentAutomation` now echoes `buttons`; new test cases (create with buttons and
  persist them, reject >3 buttons, reject a >640-char `dmMessage` once buttons are attached).
- `apps/web/src/app/instagram/posts/[postId]/dm-message-field.tsx` (new) - a client component
  combining the DM message textarea and the button-row editor in one place, not two separate
  components like `keywords-field.tsx`: the message's real character limit (640 vs. ~1000)
  depends on whether any buttons are attached, so the two fields need to share state to show
  that limit live as the user types/adds a button. Buttons submit as repeated
  `buttonTitle`/`buttonUrl` inputs (one pair per row, paired by DOM order) rather than a
  hidden serialized field - unlike keywords, each row's visible inputs already are the real
  form fields, no chip-style transformation needed.
- `apps/web/src/app/instagram/posts/[postId]/actions.ts` - `createAutomationAction` now reads
  `buttonTitle`/`buttonUrl` via `formData.getAll()`, pairs them by index, and includes
  non-empty pairs as `buttons` in the API request body.
- `apps/web/src/app/instagram/posts/[postId]/page.tsx` - swapped the plain DM-message
  textarea for `<DmMessageField />`; the existing-automation summary view now shows each
  button as a clickable chip.
- Docs: `docs/ZERNIO-INTEGRATION.md` (moved `buttons`/`linkTracking` out of the "not used"
  list; documented the list endpoint's richer `stats` shape), `docs/DATABASE.md` (`buttons`
  column, migration entry), `docs/API-SPEC.md` (request/response examples, the 640-char
  rule), this file.

**Verification actually performed**
- `scripts/lint.ps1` (eslint + typecheck + prettier) and `scripts/test.ps1` - both clean; 54
  tests passing (14 `packages/database`, 40 `apps/api`, including the 3 new button test
  cases). `packages/zernio` and `packages/validation` needed an explicit rebuild
  (`pnpm --filter ... run build`) before `apps/api`'s typecheck picked up the new
  `buttons`/`DmButton` fields - both are consumed via their compiled `dist/` output (no
  workspace path aliases in `tsconfig.base.json`), not live source, so a stale build silently
  hides new fields until rebuilt; not a bug, just a step this phase had to remember.
- Browser-verified `DmMessageField` via a throwaway route (deleted after, same technique as
  Phase 10.1): scripted typing into the DM message textarea, clicking "+ Add button", and
  filling the title/url inputs - confirmed the counter/limit switches from `/1000` to `/640`
  live the moment a button is added, and the row count label updates. Did not browser-verify
  the *existing-automation* button-chip display or a real end-to-end create-with-buttons call
  against live Zernio - both require a real connected Instagram account (this app's post
  detail page always fetches its post live from Zernio before anything else renders, so a
  seeded fake account can't reach that view), which this phase deliberately didn't touch, per
  Phase 10.1's same reasoning. The create-with-buttons path is covered by the new automated
  `apps/api` test instead.

**Known limitations / risks**
- `type: postback` and `type: phone` buttons are real Zernio fields, not built - postback
  needs a webhook handler (`messaging_postbacks`) this project doesn't have yet; phone is
  Facebook-only, irrelevant to an Instagram-only tool. Both documented, not silently dropped.
- `linkTracking`/`clickTag` are never sent explicitly - `linkTracking` defaults to `true` on
  Zernio's side, which is exactly the behavior wanted (see Phase 10.3), so there's nothing for
  this project to set; `clickTag` needs a segmentation/contacts feature this project doesn't
  have.
- No live end-to-end verification against a real Zernio account this phase (see above) - the
  `DmButton` shape and the 640-char rule were re-confirmed directly against Zernio's live
  OpenAPI spec (not assumed), but no live `createCommentAutomation` call with real buttons was
  made.

**Next phase**

Phase 10.3 - live send/click stats on the dashboard: call
`GET /v1/comment-automations?profileId=` (its richer `stats` shape, documented in Phase
10.1's report) from `packages/zernio`, surface `dmsSent`/`linkClicks` on the dashboard's stat
row and per-automation table rows. No schema change needed - these are live numbers from
Zernio, not something this project stores. Will not start until the user says to proceed.

## Phase 10.2a report

A bug fix requested by the user against the Phase 8 connect flow, not a new feature: "if an
account is already present the API still creates a new one - check whether the Zernio profile
already exists and whether an account is already connected; if it is, don't create a new one,
just update the DB."

**The two real defects**

1. **`ensureProfile` created without ever looking.** It called `POST /v1/profiles`
   unconditionally and only recovered an existing profile from the *error path* - a `409`
   that also happened to carry `details.existingProfileId`. So an organization whose
   `zernioProfileId` was never persisted locally (a crash, or a failed
   `organization.update`, after Zernio's create already succeeded) would mint a brand-new
   Zernio profile on every subsequent connect attempt. Nothing in `packages/zernio` called
   `GET /v1/profiles` at all.
2. **`createConnectUrl` never asked whether an account was already connected.** It always
   built an OAuth URL and sent the user through the full authorize round trip, even when
   `findConnectedAccount` (already implemented, already used by the callback handler) would
   have answered "this profile already has one" immediately.

**Zernio API verification** (per `CLAUDE.md`'s "never invent Zernio API behavior" rule): the
live OpenAPI spec was re-fetched from `docs.zernio.com/api/openapi`. `GET /v1/profiles`
(`operationId: listProfiles`) is real and takes an **exact-match** `name` query param whose
own spec description is "Useful to recover a profile id after an ambiguous create (timeout
followed by a 409 on retry)" - i.e. Zernio documents this endpoint for precisely this bug.
Response shape `{ profiles: Profile[] }` (+ `total`/`skip`/`limit`, present only when
`limit`/`skip` was passed). Also confirmed from the spec: the `409` on create carries
`details.existingProfileId` for the name-conflict case (`code: profile_name_conflict`), but
that **same status code** is also returned while a request with the same `Idempotency-Key` is
still processing - where that field is not guaranteed, which is why the 409 path now re-queries
by name rather than assuming the field is present.

**What changed**
- `packages/zernio/src/zernio-instagram-provider.ts`: new private `findProfileByName`
  (`GET /v1/profiles?name=`, re-checking the exact name client-side rather than trusting the
  server to have filtered). `ensureProfile` now looks first and creates only on a miss; the
  409 path is kept as a backstop for the genuine race between the lookup and the create, and
  re-queries by name when `details.existingProfileId` is absent.
- `packages/zernio/src/instagram-provider.ts`: `EnsureProfileResult` gains `reused: boolean`
  so a caller can tell "adopted an existing profile" from "created a new one"; the
  `ensureProfile` doc comment now states the lookup-first contract as a requirement on
  implementations, not just a caller-side convention.
- `apps/api/src/instagram/instagram.service.ts`: `createConnectUrl` calls
  `findConnectedAccount` before building any OAuth URL. When Zernio already reports a
  connected account, the new private `adoptConnectedAccount` upserts it into
  `instagram_accounts` (on `zernioAccountId`, so never a second row) and the endpoint returns
  `{ alreadyConnected: true, account }`. Return type is now the discriminated `ConnectResult`.
- **Tenant-isolation guard kept intact**: an account already connected to a *different*
  organization is never adopted - `adoptConnectedAccount` returns `null` and the caller falls
  back to the normal OAuth flow, where `handleCallback` still raises its proper `409`. A
  `P2002` from the concurrent-connect race takes the same fallback rather than failing the
  request.
- `apps/api/src/instagram/instagram.controller.ts`: return type updated to `ConnectResult`.
- `apps/web/src/app/instagram/actions.ts`: handles the discriminated response - redirects to
  `/?instagram=already-connected` instead of an external OAuth URL when there is nothing to
  authorize.
- `apps/web/src/app/page.tsx`: new `already-connected` status banner.
- Tests: `apps/api`'s `FakeInstagramProvider` now models the real lookup-before-create
  contract (same name -> same id, `reused: true`) instead of always returning a fresh id - a
  fake that kept minting ids would have let the duplicate-creating regression pass. Four new
  e2e tests (below). `automations.e2e.test.ts`'s own fake updated for the new `reused` field.

**Commands executed and results**
| Command | Result |
|---|---|
| `scripts/pnpm.ps1 --filter @automationdm/zernio run build` | `tsc`, exit 0 |
| `scripts/db.ps1 start` | Local Postgres already running (PID 2504) |
| `scripts/pnpm.ps1 --filter @automationdm/api run test` | **44/44 passed** across 3 files - `instagram.e2e` 15 -> **19** (4 new), `automations.e2e` 16, `organizations.e2e` 9 |
| `scripts/lint.ps1` | ESLint 0 errors, typecheck 8/8 `Done`, Prettier all pass. Exit 0. |
| `scripts/pnpm.ps1 --filter @automationdm/web run build` | `next build`, exit 0, route list unchanged (10 routes + Proxy) |

**The four new tests** (all in `apps/api/src/instagram/__tests__/instagram.e2e.test.ts`)
- *adopts an existing Zernio profile for the same slug instead of creating a duplicate* -
  seeds a pre-existing profile for the org's slug, asserts connect resolves to **that** id and
  persists it, rather than creating a second one. Directly covers defect 1.
- *returns the already-connected account instead of an authUrl when Zernio already has one* -
  asserts `alreadyConnected: true`, no `authUrl`, and that the account was reconciled into the
  local DB without any OAuth round trip. Directly covers defect 2.
- *does not create a second local row when connect runs again for an already-connected
  account* - runs connect 3x, asserts exactly one `instagram_accounts` row.
- *falls back to the OAuth flow when the connected account belongs to another organization* -
  asserts the cross-tenant case is **not** silently adopted and the original owner's row is
  untouched.

**Known limitations / risks**
- Verified against the **fake** provider and the live OpenAPI spec, not against a live Zernio
  account - no real `GET /v1/profiles` call was made during this fix (it needs a real
  `ZERNIO_API_KEY` and a real connected account to be meaningful). The endpoint, its `name`
  filter semantics, and its response shape all come from the live spec, not assumption, but
  the first real-network exercise of `findProfileByName` will be the next live connect.
- `ensureProfile`'s `reused` flag is returned but not yet acted on by `apps/api` beyond being
  available - `createConnectUrl` currently only needs the id. Left in place because the
  distinction is the load-bearing fact this fix is about, and Phase 11's reconciliation work
  is the natural consumer.
- `findProfileByName` fetches without `limit`/`skip`, so it relies on Zernio's exact-match
  `name` filter returning a small result set. Fine at this project's scale (one profile per
  organization, 3-4 organizations); revisit only if profile counts ever grow enough for the
  unpaginated list to matter.
- The `already-connected` banner is a new user-visible string in `apps/web` - verified by
  build/typecheck, not by a browser walkthrough this pass (no live Zernio connection available
  to trigger the branch end to end).

## Phase 10.2b report

Four user-reported bugs plus a UI pass, all against work that had already shipped. Not new
feature scope - every item here is a defect fix or a usability gap in Phases 9/10/10.1.

### Issue 1 - automations existed in Zernio but the post page showed "No automation yet"

**Cause**: `AutomationsService.listForPost` read only `prisma.automation.findMany`. But Zernio
is the system of record - it executes automations server-side (resolved in Phase 10). An
automation created directly in Zernio's dashboard, or by a request whose local insert failed
after the Zernio call already succeeded, had no local row and was therefore invisible.

**Fix**: when nothing is found locally, `listForPost` now calls `listCommentAutomations`,
filters to this account + post, and **backfills the local row** so the org-wide dashboard list
sees it too. A Zernio failure is caught and degrades to "no automation" rather than breaking
the page - this is a read path. The `create` 409 path reconciles the same way, so a post whose
automation was made in Zernio's dashboard stops showing a create button that could only ever
409.

### Issue 2 - "Could not create the automation. Please check your input"

**Cause**: `create-automation-modal.tsx` is a 3-step wizard that renders each step
conditionally. React *unmounts* steps 1 and 2 when the user reaches step 3, and an unmounted
input is gone from the DOM - so `name`, `dmMessage`, and the `buttonTitle`/`buttonUrl` pairs
were all absent from the submitted `FormData`. `createAutomationSchema` correctly rejected the
resulting nulls; the message was accurate, the payload was the problem.

**Fix**: every submitted value now lives in an always-mounted hidden field; the visible inputs
lost their `name` attributes so they cannot double-submit.

### Issue 3 - the two post ids were swapped (found while verifying issue 2, not reported)

Zernio's own spec is explicit, and the two fields are different ids:

- `platformPostId` - "Platform media/post ID" (Instagram's own media id, the id an incoming
  comment actually carries)
- `postId` - "Zernio post ID ... required only when also targeting a specific post via
  platformPostId", which this project always does

This project sent Zernio's own `_id` as `platformPostId` and never sent `postId` at all. The
automation was therefore scoped to an id Instagram never reports, so **it could never fire**.
Confirmed against a real API response: `platformPostId` held a 24-char ObjectId.

**Fix**: `createCommentAutomation` now sends both fields with their correct ids;
`CommentAutomation` carries both back. Reconciliation (issue 1) matches on **either** id,
because automations created before this fix carry only the wrong one.

**Known data impact**: automations created before this fix are still scoped to the wrong id in
Zernio. They now appear in the app but will not fire. Zernio has
`PATCH /v1/comment-automations/{id}`, which this project does not implement - repairing them
needs either that endpoint or deleting/recreating them in Zernio. Flagged to the user, not
silently fixed.

### Issue 4 - UI pass

- **Dark/light switch** (`app/theme-toggle.tsx`): the dark palette had been bound *only* to
  `@media (prefers-color-scheme: dark)`, so a dark-mode OS forced dark with no override -
  "the entire site is showing darker". `globals.css` now encodes three states: light default,
  system (`:not([data-theme='light'])` inside the media query), and an explicit choice
  (`[data-theme='dark']`, last so it wins both ways). The stored preference is applied by an
  inlined `<head>` script *before first paint* - a React effect runs after paint, which
  flashes the wrong theme. `<html suppressHydrationWarning>` plus a mount guard keeps the
  first client render matching the server's.
- **Fixed shell + posts browser** (`app/instagram/posts/posts-browser.tsx`): the whole
  document used to scroll, carrying the sidebar away. The shell is now `h-screen
  overflow-hidden` with scrolling delegated to the content pane (`min-h-0` on the flex child
  is load-bearing - a flex item defaults to `min-height:auto` and refuses to shrink). Adds a
  card/list toggle, caption search, newest/oldest sort, selectable page size, numbered jump
  pagination, and a windowed virtual scroller.
- **Full-window fetch**: Zernio's list endpoint has no search or sort parameters, so both
  happen client-side - which means they must cover every post, not just the visible page, or
  "search" would silently only search 12 items. The page now fetches the account's whole
  synced window (limit 500, Zernio's own max and the same window `getPost` already relies on)
  in one call. Tradeoff: one larger fetch instead of many small ones; an account with more
  than 500 synced posts would have an invisible tail.
- **Loading overlay** (`app/loader.tsx`): `callApi` is server-side only (it signs
  `API_INTERNAL_SECRET`, which can never reach the browser), so there is no client fetch to
  hook a spinner onto. Every API call is either a server render (a navigation) or a server
  action (a form submit), so the overlay tracks exactly those two via `useLinkStatus` and
  `useFormStatus`. Navigations are delayed 250ms so prefetched, instant ones do not flash.

### Three real bugs found while building the UI pass, each fixed

1. **Virtual scroller looped back on itself while scrolling.** The scroll-reset effect
   depended on the `items` array, which is a fresh `slice()` identity on every parent render -
   so it re-fired mid-scroll and snapped to the top repeatedly. Re-keyed on a stable
   `page|pageSize|sort|search` string. Row geometry was also pinned (`gridAutoRows` =
   rowHeight - gap) because natural-height rows drifted against the spacer math.
2. **Captions vanished from post cards.** A square thumbnail's height equals the *column
   width* (~231px at 4 columns), which consumed the entire fixed 248px row and clipped the
   caption out. The thumbnail is now a fixed 150px tall, leaving 86px for a caption block that
   needs ~75px - independent of column count.
3. **The loader rendered nothing.** Two causes, both silent: (a) `.loader` never sets
   `display`, and a bare `<span>` is `display:inline`, where width/height are **ignored** - the
   box collapsed to 0x0 and the `width: inherit` pseudo-elements inherited that zero;
   (b) the snippet's animation was named `spin`, which **collides with Tailwind's own
   `@keyframes spin`** - Tailwind's plain-rotation definition won and replaced all eight
   `box-shadow` steps, erasing the only thing that draws the spinner. Renamed to
   `loader-orbit`; added `display: inline-block`; pinned `font-size` so the `em`-based offsets
   scale with the spinner rather than the inherited text size; and made `--color-1` follow the
   theme (`#fff` was invisible on the light theme).

### Commands executed and results

| Command | Result |
|---|---|
| `scripts/pnpm.ps1 --filter @automationdm/zernio run build` | `tsc`, exit 0 |
| `scripts/pnpm.ps1 --filter @automationdm/api run test` | **46/46 passed** (was 44 - two new reconciliation tests) |
| `scripts/pnpm.ps1 --filter @automationdm/web run build` | `next build`, exit 0, 10 routes + Proxy |
| `scripts/lint.ps1` (1st run) | **1 ESLint error** - a `@next/next/no-img-element` disable comment for a rule this repo does not have (no `eslint-config-next`, per the Phase 2 report); referencing an undefined rule is itself an error. Removed. |
| `scripts/lint.ps1` (2nd run) | ESLint 0 errors, typecheck 8/8 `Done`, Prettier all pass. Exit 0. |
| Headless Edge screenshot of the compiled `.loader` CSS | Spinner renders (dark + `#ff3d00` arcs). Re-run with the fix reverted confirmed a 0x0 box - proving the cause rather than assuming it. |
| Virtualizer scroll-sweep simulation (5 layouts) | Constant total height and full viewport coverage at every scroll offset |

### New tests

`apps/api/src/automations/__tests__/automations.e2e.test.ts`:

- *lists an automation that exists only on Zernio, and backfills it locally* - the reported bug
- *does not adopt a Zernio automation belonging to a different connected account* - keeps the
  reconciliation path inside the same tenant-isolation discipline as the rest of the service
- the existing "Zernio already has an automation" test now asserts the backfill happens (it
  previously asserted `count === 0`, which encoded the old, broken behavior)
- the create test now asserts `zernioPostId` and `platformPostId` land in their **own** fields,
  which is the regression guard for issue 3

The `FakeInstagramProvider`s were updated to model the real contracts rather than conveniently
agreeable stubs: `ensureProfile` returns the same id for the same name (`reused: true`), and
`getPost` returns a `platformPostId` deliberately *different* from the Zernio post id
(`ig-media-<id>`), so a swap between the two cannot pass.

### Known limitations / risks

- **Not verified in a browser against live Zernio.** Every fix here is verified by the test
  suite, the build, the compiled-CSS checks, and (for the loader) a headless screenshot. The
  reconciliation path has not been exercised against a real Zernio account, because that needs
  a live `ZERNIO_API_KEY` and a real connected account.
- **Pre-existing automations will not fire** until their `platformPostId` is corrected in
  Zernio - see issue 3 above.
- The posts browser's virtual scroller uses fixed row heights (88px list / 248px grid). Any
  future change to card contents must keep those constants in step, or content drifts against
  the scrollbar.
- Thumbnails are no longer square (fixed 150px band, `object-cover`) - the cost of the fixed
  row heights the virtualizer needs.
- `.env.example` in the working copy currently holds **real** secret values. It is deliberately
  excluded from this commit and has never been committed with those values (verified with
  `git log -S`). It must be reset to empty placeholders before it is ever staged again.

## Phase 10.3 report

Live send/click stats on the dashboard, built to a mockup the user supplied: four summary stat
cards, post thumbnails per row, plus search and sort over the automations table.

**What was built**

- `packages/zernio`: new `CommentAutomationStats` (`triggered`, `dmsSent`, `dmsFailed`,
  `uniqueContacts`, `trackedSends`, `linkClicks`, `uniqueClicks`) on `CommentAutomation.stats`.
  Nullable **by design**: only the LIST endpoint returns this richer shape - create/get return a
  smaller `{totalTriggered, totalSent, totalFailed}` object instead. That inconsistency in
  Zernio's own API was documented back in Phase 10.1; `stats: null` is how a
  CommentAutomation built from a create response represents "no stats here", as distinct from a
  stats object whose counters are genuinely 0.
- `apps/api`: `listForOrganization` now enriches every row with `stats` and a `post` preview
  (`caption`, `thumbnailUrl`, `permalink`). Both are fetched live from Zernio and never stored
  locally, per ADR 0005. Post previews come from **one `listPosts` call per distinct account**,
  not per automation - several automations usually share an account, so a per-row call would be
  N round trips for the same data. `isActive` now prefers Zernio's value over the local copy,
  since this project has no edit/pause endpoint and a toggle flipped in Zernio's own dashboard
  would otherwise never appear here.
- `apps/web`: new `app/automations-browser.tsx` (client component) - search across name,
  keywords, account and post caption; sort by most sent / most clicks / name / enabled-first;
  thumbnail, sent and clicks columns. The dashboard's four stat cards are Active automations,
  DMs sent, Button clicks (with CTR), and Connected accounts. The old server-rendered
  `AutomationsTable`/`StatusPill` in `page.tsx` were deleted, not left alongside.

**The CTR denominator is `trackedSends`, not `dmsSent`** - Zernio's own spec says so
explicitly, and the reason is real: a DM carrying no tracked link can never be clicked, so
dividing by `dmsSent` systematically understates the rate. `AutomationStats.clickThroughRate`
is `null` (not `0`) when `trackedSends` is 0, because "nothing trackable has gone out yet" and
"a genuine 0% click-through" are different facts, and dividing by zero would yield NaN. The
org-wide card recovers summed `trackedSends` from each row's own rate
(`clicks / rate * 100`) rather than widening the API surface to expose it.

**Degradation is explicit, not silent.** A failed stats or posts fetch leaves `stats`/`post`
as `null`, and the UI renders an em dash - never a fabricated `0`, which would read as "this
automation has sent nothing". The row itself still renders either way: a Zernio outage
downgrades the dashboard to names/keywords/status rather than breaking the page, the same
read-path discipline as Phase 10.2b's reconciliation.

**Commands executed and results**

| Command | Result |
|---|---|
| `scripts/pnpm.ps1 --filter @automationdm/zernio run build` | `tsc`, exit 0 |
| `scripts/pnpm.ps1 --filter @automationdm/api run typecheck` (1st) | 3 errors - the test fakes' `CommentAutomation` literals lacked the new required `stats`. Fixed. |
| `scripts/pnpm.ps1 --filter @automationdm/api run test` | **48/48 passed** (was 46 - two new stats tests) |
| `scripts/pnpm.ps1 --filter @automationdm/web run build` | `next build`, exit 0 |
| `scripts/lint.ps1` (1st) | ESLint 0, typecheck 8/8, Prettier flagged 2 files |
| `pnpm run format` + `scripts/lint.ps1` (2nd) | All three pass, exit 0 |

**New tests**

- *enriches each row with live Zernio stats and the post thumbnail* - asserts
  `clickThroughRate === 25` from 2 clicks / 8 `trackedSends`. The fake deliberately sets
  `trackedSends` (8) **lower** than `dmsSent` (10), which is how Zernio's real data behaves, so
  computing CTR against the wrong denominator yields 20% and fails the assertion. That is the
  regression guard for the denominator choice.
- *returns null stats rather than zeros when Zernio cannot be reached* - a new
  `failListCommentAutomations` flag on the fake makes the stats call throw; asserts
  `stats === null` and that the row still renders.
- The automations fake's `listPosts` now returns registered posts instead of an empty array,
  so the thumbnail lookup has something real to resolve against.

**Known limitations / risks**

- **Not verified against live Zernio.** The stats shape comes from Zernio's live OpenAPI spec
  (re-read this phase) and the fake models it, but no real `listCommentAutomations` response has
  been observed with this code. The user's own screenshot of a real response was the reference
  for the field names.
- Stats are all-time totals; Zernio's list endpoint exposes no date filtering, so no
  "last 7 days" view is possible without a different endpoint.
- `delivered`/`read`/`uniqueContacts`/`dmsFailed` are mapped in `packages/zernio` but not
  surfaced in the UI - available for a later phase without another provider change.
- The dashboard now makes 1 + N Zernio calls (one automations list + one posts list per
  distinct connected account). Fine at this project's scale (3-4 users, one account each);
  worth caching if account counts ever grow.
- Search/sort are client-side over the org's own automations, which is correct at this scale -
  the full list is already loaded for the table.

## Phase 10.4 report

Performance work, triggered by the user's report that "every API call takes 5 to 8 seconds".

**Diagnosis came before any code.** Every layer was measured against the live deployments rather
than guessed at, and the result redirected the work twice. The database turned out to contribute
~20 ms and was not a factor at all; Redis - the user's own hypothesis - would have been the wrong
fix. Two infrastructure causes were addressed first (Vercel functions and Supabase were in
different regions; both are now in Mumbai), which removed most of the 5-8 s. The remaining
latency was external Zernio calls plus a render that streamed nothing. The full measurement table
lives in `docs/ADR/0006-response-caching-and-freshness.md`.

**What was built**

- **Phase 0 (enabling).** `apps/web/src/lib/api.ts` set `cache: 'no-store'` *after* `...init`, so
  no caller could ever opt into caching - fixed by moving it above the spread. `auth()` was being
  called once per `callApi` (four JWE decrypts per dashboard render); it is now memoized in
  `lib/session.ts`, as is the duplicated org lookup in `lib/organization.ts`.
- **Phase 1a.** The post detail page awaited its post and its automations sequentially, purely
  because each wanted its own `try`/`catch`. `Promise.allSettled` parallelizes them while
  preserving the original asymmetry - a failed post is fatal to the page, a failed automations
  lookup is not.
- **Phase 1b (streaming).** The dashboard and posts pages now split their awaits into child
  server components behind `<Suspense>` with per-section skeletons (`app/skeleton.tsx`), plus a
  route `error.tsx`. The organization lookup that gates `redirect('/onboarding')` stays **above**
  every boundary: `redirect()` cannot change a response that has already begun streaming, so once
  a fallback flushes it degrades to a client-side redirect.
- **Phase 2 (caching).** `callApiCached` wraps `unstable_cache` with a 60s TTL and tags from a
  single registry (`lib/cache-tags.ts`). Every mutating server action expires the tags it affects.
  Degraded responses - `200` with `stats: null` when Zernio is unreachable - are returned but
  never stored. A freshness label reports how old the figures are. Full rationale in ADR 0006.
- **Bounded Zernio calls.** `ZernioInstagramProvider.request` had no timeout; it now uses
  `AbortSignal.timeout(10_000)`, converting a `TimeoutError` into a 504 `ZernioApiError` so
  existing 404/409 branching is unaffected. 10 s was chosen against measured Zernio latency
  (0.3-1.7 s normal, 1.73 s slowest observed).
- **Completed the update/delete endpoints.** `AutomationsService.update` and `.remove` did not
  exist, while `automations.controller.ts` called both - see "the typecheck failure" below.

**Two plan-level errors caught by reading the docs rather than trusting the plan**

- The plan specified `updateTag()` for invalidation. The installed Next 16.3.0 docs name
  `revalidateTag`/`revalidatePath` as `unstable_cache`'s invalidation path; `updateTag` is
  documented for `fetch`-tagged and `'use cache'` entries, which these are not. Using it would
  have failed **silently**: the write succeeds, the page re-renders, the user still sees old
  numbers. Implemented as `revalidateTag(tag, { expire: 0 })`.
- The plan proposed storing post captions and thumbnails in Postgres as "the biggest single win".
  It is not: the saving is 0.23-0.79 s rather than ~1.7 s (the stats call runs in parallel, so
  removing the posts call only shaves the slower leg down to the faster one), and Instagram
  thumbnail URLs are signed and expiring, so a stored URL rots into a broken image. Dropped from
  the plan rather than built on a bad premise.

**The typecheck failure this phase surfaced**

The first `scripts/lint.ps1` run failed with two errors in `apps/api`:
`automations.controller.ts` called `AutomationsService.update` and `.remove`, neither of which
existed. `git diff HEAD` on that directory was empty - commit `ff1cf67` ("add update and delete
endpoints for organization automations") had landed the controller, the validation schema, the
Zernio provider methods and the web-side actions, but not the service methods joining them. The
test suite was green throughout, because vitest does not typecheck. At runtime the dashboard's
edit and delete buttons would have thrown on `undefined`.

Both methods were implemented. Three details worth recording:

- `requireOwnAutomation` re-checks the client-supplied `automationId` against the session-derived
  `organizationId`, returning 404 (not 403) for another org's row - the same tenant-isolation
  discipline as `requireOwnAccount`.
- The conditional 640-char DM limit is **re-checked against the stored row**. `updateAutomationSchema`
  cannot enforce it alone, because a partial update need not send `buttons` and `dmMessage`
  together; patching only `dmMessage` on an automation that already has buttons stored would
  otherwise pass validation and come back from Zernio as an opaque 400.
- Buttons write `Prisma.DbNull`, not `undefined`, when empty. `create` uses `undefined` correctly
  (there is nothing to clear), but on update `undefined` means "leave this column alone" - so
  removing every button would have succeeded on Zernio and silently done nothing locally.

**Commands executed and results**

| Command | Result |
|---|---|
| `scripts/pnpm.ps1 --filter @automationdm/web typecheck` | Done, exit 0 |
| `scripts/lint.ps1` (1st) | **2 typecheck errors** in `apps/api` (missing service methods, pre-existing at HEAD) + Prettier flagged 3 files, also pre-existing |
| `scripts/pnpm.ps1 --filter @automationdm/api typecheck` (after fix) | Done, exit 0 (both `tsconfig.json` and `tsconfig.serverless.json`) |
| `scripts/lint.ps1` (2nd) | ESLint 0, typecheck 8/8 Done, Prettier all pass. Exit 0. |
| `scripts/test.ps1` | **62/62 passed** (14 database + 48 api) |
| `scripts/pnpm.ps1 --recursive --if-present run build` | All 8 workspaces, exit 0; `next build` compiled in 17.7 s |

**Known limitations / risks**

- **The caching layer has not been verified at runtime.** Everything above is verified by the
  suite, the builds and the type system. The plan's runtime verification is **outstanding**: TTFB
  and before/after timings, `NEXT_PRIVATE_DEBUG_CACHE=1` hit/miss confirmation, that pressing Sync
  actually serves fresh data on Vercel (Next's docs warn tag invalidation is per-instance by
  default and platform-coordinated, so this must be confirmed empirically rather than assumed),
  that a stats-degraded response is genuinely not cached, and the drop in Zernio calls per
  dashboard load. Until that is done, the latency improvement is *expected*, not *measured*.
- **`update`/`remove` have no test coverage**, and neither PATCH nor DELETE has ever run against
  live Zernio - the provider methods existed but were unreachable until this phase. Needed cases:
  cross-org 404, the stored-row 640-char check, `buttons: []` genuinely nulling the column, a
  Zernio 404 on update surfacing as NotFound without deleting the local row, and a Zernio 404 on
  delete still removing it.
- **The Vercel Data Cache survives deployments**, so the stored entry shape is versioned in the
  key (`['callApiCached', 'v2', path]`). Any future change to what is stored must bump it.
- `syncAutomationsAction` changed signature from `()` to `(formData: FormData)`, and `SyncButton`
  now requires an `organizationId` prop.
- `.env.example` still lists `REDIS_URL`, `S3_*` and `SENTRY_DSN` from the pre-ADR-0005 scope. No
  code reads them; they are stale and should be removed.
- Phase 3 of the performance plan (an aggregate `/api/me/dashboard`, or moving the organization id
  into the Auth.js JWT, to remove the ~0.2 s `/api/organizations` call that still blocks above
  every Suspense boundary) is deliberately **not** built - the plan gates it on the measurements
  above showing it is still needed.
