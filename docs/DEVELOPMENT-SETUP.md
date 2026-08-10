# Development Setup

Status: Phase 0. This document records what was actually found on the development
machine and the decisions that follow from it. Update the "Environment Inspection"
section if the user's machine changes (new laptop, IT reimages it, admin rights granted, etc.).

## Environment inspection (2026-08-10)

| Check | Result |
|---|---|
| `node --version` | `v16.13.0` (global install at `C:\Program Files\nodejs`) |
| `npm --version` | `8.1.0` |
| `git --version` | `2.49.0.windows.1` |
| `docker --version` | **not installed** (command not found) |
| `docker compose version` | **not available** (depends on Docker) |
| PowerShell | Windows PowerShell `5.1.22621.6931` (not PowerShell 7) |
| `corepack --version` | `0.10.0` — ships bundled with the global Node 16 install |
| Admin rights | None. `icacls` shows the project directory is writable by `Authenticated Users` (Modify), not owned/admin-only |
| Disk space on `D:` | ~170 GB free — no constraint |
| Project directory | `D:\Personal\Projects\AutomationDM`, empty, writable |
| Other projects depending on global Node 16 | Unknown/possible — **the global Node 16 install must not be touched** (rule #27/28 in the master prompt) |

Conclusion: the target stack (Next.js 16.x, NestJS 11.x) requires **Node ≥ 20**, and the
machine's global Node is 16 with no admin rights to change it system-wide. Docker Desktop is
not installed, and installing it typically requires admin rights and either WSL2 or
Hyper-V enabled — neither of which we can assume or configure. Both problems are solved the
same way: **everything the project needs lives inside the project directory**, never in a
system-wide location.

## Node.js strategy: project-local runtime

We do **not** install Node globally, do **not** use `nvm-windows` (it manages a machine-wide
symlink and commonly wants elevation), and do **not** touch `C:\Program Files\nodejs`.

Instead:

1. A pinned Node version is downloaded as the official **Windows x64 zip** distribution
   (not the `.msi` installer — the zip is just files, no install step, no registry writes,
   no admin prompt) from `https://nodejs.org/dist/`.
2. It is extracted to `.tools/node/` inside the repository. This directory is **gitignored**
   — it's a downloaded binary cache, not source.
3. Every project script (`scripts/*.ps1`) prepends `.tools/node` to `$env:PATH` for that
   process only, then runs `npm`/`npx`/`node`. The global Node 16 on the user's `PATH` is
   never modified and remains available to any other project on the machine.
4. `corepack` ships inside the downloaded Node binary itself, so enabling it
   (`.tools/node/corepack.cmd enable`) only ever touches shims inside `.tools/node` — it does
   not touch the global Node 16's corepack.
5. pnpm is managed via that project-local corepack, pinned by the `packageManager` field in
   the root `package.json`, so every contributor gets the exact same pnpm version without a
   global `npm install -g pnpm`.
6. The root `package.json` `engines` field documents the required Node range for anyone
   reading the repo; it is not itself an enforcement mechanism on Windows without admin
   rights, so `scripts/setup.ps1` also checks the downloaded runtime's version explicitly.

**Chosen Node version: 24.x (Active LTS)**, the newest line with "Active LTS" status as of
August 2026 (supported until 2028-04-30). We pin to the latest 24.x patch at setup time
rather than hardcoding a patch number that will go stale — `scripts/setup.ps1` reads
`https://nodejs.org/dist/index.json` to resolve it, or falls back to a pinned known-good
version if offline. Node 26 is the current release but not yet LTS; Node 24 is the safer
choice for a production SaaS.

This satisfies both frameworks' minimums (Next.js 16 requires Node ≥ 20; NestJS requires
Node ≥ 20).

Do not run any of the following on this machine:
```
npm install -g node
npm install -g pnpm
npm install -g yarn
npm install -g @nestjs/cli
npm install -g prisma
```
Use `npx <tool>` (resolved against the project-local Node/npm) or a root `package.json`
script instead.

## PostgreSQL + Redis strategy

Docker is the preferred way to run PostgreSQL and Redis locally (see `docker-compose.yml` at
the repo root, created now for when Docker becomes available), but **Docker is not currently
installed on this machine** and installing Docker Desktop is an admin-gated, machine-level
change that is out of scope for an AI agent to perform unattended. Three options exist;
none has been executed yet — this is a decision for the user before Phase 4/11:

| Option | Admin required? | Notes |
|---|---|---|
| **A. Install Docker Desktop** | Usually yes (WSL2 or Hyper-V backend) | Best long-term option once available. User must install this themselves. |
| **B. Portable local binaries** | No | PostgreSQL via a zip-extracted binary (no installer) running `initdb`/`pg_ctl` against a project-local data directory under `.tools/postgres-data/`; Redis via a portable Windows build (e.g. the `tporadowski/redis` release zip, just an `.exe`, no service registration). Fully offline, fully project-local, no account needed. |
| **C. Cloud dev databases** | No | A free-tier managed Postgres (e.g. Neon, Supabase) and managed Redis (e.g. Upstash) reachable via `DATABASE_URL`/`REDIS_URL` in `.env`. Lowest setup friction, but **creating an external account requires explicit user approval** before an agent does it. |

Recommendation: start with **Option B** for fully offline, zero-account local dev, and only
consider C if the user prefers not to manage local binaries. PostgreSQL was finalized this
way in Phase 4 (`docs/ADR/0003-local-postgresql-strategy.md`). **Redis is no longer part of
this project at all** — the scope was later simplified to not need a queue; see
`docs/ADR/0005-simplified-mvp-architecture.md`. The Redis mentions in the table above are
kept as historical context for that earlier investigation, not a live plan.

## Scripts

All scripts live in `scripts/` and are PowerShell (`.ps1`), matching the primary shell on
this machine. They all resolve tools relative to `.tools/node/` first.

- `scripts/setup.ps1` — downloads/verifies the pinned Node runtime into `.tools/node/`,
  enables corepack, installs workspace dependencies via pnpm.
- `scripts/dev.ps1` — runs the web/api/worker dev processes locally.
- `scripts/test.ps1` — runs unit/integration tests via the project-local runtime.
- `scripts/lint.ps1` — runs ESLint + `tsc --noEmit` via the project-local runtime.

None of these scripts require administrator privileges, and none of them modify anything
outside the repository directory.

## Summary for future contributors

If you clone this repo fresh on a Windows machine with no admin rights and an old global
Node install:

```powershell
.\scripts\setup.ps1
```

This is the only command that should be needed to get a working local toolchain, without
touching anything outside this folder.

## Phase 1 update (2026-08-10): confirmed working end to end

`scripts/setup.ps1` was actually run on this machine and verified:

- Resolved and downloaded Node **v24.19.0** (the current 24.x LTS patch at the time) to
  `.tools/node/`.
- Enabled corepack from within that runtime and installed pnpm **9.15.0** (the version
  pinned by root `package.json`'s `packageManager` field — a newer pnpm exists upstream,
  but we pin deliberately rather than floating, and corepack respects the pin).
- Installed all 9 workspace projects' dependencies (110 packages resolved) via
  `pnpm install`.
- `scripts/lint.ps1` (ESLint + `tsc --noEmit` per package + Prettier check) and
  `scripts/test.ps1` (currently a no-op — no package defines a `test` script yet) both run
  cleanly, exit 0.
- Confirmed after all of the above: `node --version` / `npm --version` on this machine's
  normal `PATH` are still `v16.13.0` / `8.1.0` at `C:\Program Files\nodejs` — unchanged.

Full command log and file list: `docs/IMPLEMENTATION-ROADMAP.md`, "Phase 1 report".

## Enforcing the project-local Node runtime (Phase 2 stabilization, 2026-08-10)

The Phase 2 update below documented a real bug: a *correct* project-local `pnpm`
invocation could still spawn its build tools under the global Node 16 if the calling
shell's `PATH` hadn't been fixed up first. This section is the fix. It supersedes "always
remember to set `$env:PATH`" with tooling that checks instead of trusting.

**Canonical entry points — use these, not raw `pnpm`/`corepack`/`node`:**

| Command | Purpose |
|---|---|
| `.\scripts\setup.ps1` | First-time (or repeat) setup: downloads/verifies `.tools/node/`, enables corepack, `pnpm install`. |
| `.\scripts\dev.ps1` | Runs web + api + worker dev processes. |
| `.\scripts\lint.ps1` | ESLint + typecheck + Prettier check. |
| `.\scripts\test.ps1` | Workspace test suite (no-op until a package defines one). |
| `.\scripts\pnpm.ps1 <anything>` | **New.** Canonical wrapper for any ad hoc pnpm command not covered by the above — `.\scripts\pnpm.ps1 --filter @automationdm/api run build`, `.\scripts\pnpm.ps1 why some-package`, `.\scripts\pnpm.ps1 install`, etc. Never invoke `pnpm`, `.tools\node\corepack.cmd pnpm`, or `.tools\node\pnpm.cmd` directly — always through this wrapper. |
| `.\scripts\doctor.ps1` (or `pnpm run doctor` once already inside a correct session) | **New.** Environment diagnostics — see below. |

**How enforcement works:** every `scripts/*.ps1` dot-sources `scripts/_env.ps1` and calls
`Assert-ProjectLocalNode`, which now does more than prepend `.tools/node` to `$env:PATH` —
it re-resolves `node` afterward with `Get-Command`, confirms the resolved executable's
directory is exactly `.tools/node` (not merely that PATH *contains* it — a stray earlier
entry could still shadow it), confirms the resolved version is `>= 20`, and `exit 1`s with
a clear message if any of that fails. Trusting a PATH assignment is what caused the
original bug; checking what actually resolved is the fix.

**Is bare `pnpm` safe?** Verified on this machine: **no bare `pnpm` exists on `PATH` at
all** — a fresh shell running `pnpm --version` gets "the term 'pnpm' is not recognized"
(global corepack, bundled with the global Node 16, was never `enable`d against that global
install, so it exposes no global `pnpm` shim; ours lives only inside `.tools/node/`). That
is a *safe failure* today, but it is incidental, not enforced — if anyone ever runs
`corepack enable` globally, or `npm install -g pnpm`, on this machine, bare `pnpm` would
silently start resolving to that instead. **Treat bare `pnpm` as unsafe regardless of what
it currently does** — the rule is "always go through `scripts/*.ps1` or
`scripts/pnpm.ps1`," not "bare `pnpm` happens to error right now."

**Environment diagnostics (`scripts/doctor.ps1`):** reports, in order — project root,
whether `.tools/node/` exists at all, what `node` resolves to *before* any fix-up (to show
the risk directly), then Node version / executable path / npm version / pnpm version /
"Using project-local: True|False" *after* the fix-up. Exits non-zero with a clear message
if the wrong runtime is in play. Example output:

```
Before PATH fix-up:
  node resolves to:     C:\Program Files\nodejs\node.exe
  node version:         v16.13.0

After PATH fix-up (what scripts/*.ps1 and scripts/pnpm.ps1 actually use):
  Node version:          v24.19.0
  Node executable:       D:\Personal\Projects\AutomationDM\.tools\node\node.exe
  npm version:           11.17.0
  pnpm version:          9.15.0
  Using project-local:   True

OK: project-local Node v24.19.0 is correctly resolved...
```

**A second bug found while building this fix, worth keeping in mind for every future
`.ps1` file in this repo:** the first draft of `scripts/_env.ps1` used an em dash (`-`
typed as the Unicode character, not a hyphen) inside a string literal. Windows PowerShell
5.1 reads `.ps1` files without a UTF-8 BOM using the legacy system codepage; the multi-byte
UTF-8 sequence for that character was misread and corrupted the string's closing quote,
producing a `TerminatorExpectedAtEndOfString` parse error several lines further down the
file (PowerShell's parser reports these downstream of the actual corruption, which makes
them confusing to debug). **Keep every `scripts/*.ps1` file plain ASCII** — plain hyphens
instead of em/en dashes, straight quotes instead of curly ones, `->` instead of arrows.
Markdown/`.md` files are unaffected (not parsed by PowerShell) and can keep using them
normally.

## Local PostgreSQL (Phase 4, 2026-08-10)

Full decision record: `docs/ADR/0003-local-postgresql-strategy.md`. Short version: a
project-local Postgres 17.10 server, distributed via the `embedded-postgres` npm package
(installed as a normal part of `pnpm install` — no separate download step), controlled via
direct `pg_ctl` calls so it works across separate terminal sessions. No admin rights, no
Docker, nothing outside this repository.

**Setup:**

```powershell
.\scripts\db.ps1 start     # first run: initializes .tools/postgres-data/, then starts
```

Then create a local `.env` (never committed — copy `.env.example` and fill in):

```
DATABASE_URL=postgresql://automationdm:automationdm@localhost:5432/automationdm
```

That user/password is a fixed, documented, localhost-only dev credential (see the ADR's
"Security considerations") — not something you need to invent or keep secret.

**Day to day:**

```powershell
.\scripts\db.ps1 status    # "server is running (PID: ...)" or "no server running"
.\scripts\db.ps1 stop
.\scripts\db.ps1 reset     # stop (if running) + delete .tools/postgres-data/ entirely
```

`.\scripts\test.ps1` and `.\scripts\dev.ps1` now call a new `Import-DotEnv` helper (in
`scripts/_env.ps1`) that loads the repo-root `.env` into the process environment before
running anything — so `DATABASE_URL` (and every other `.env` value) is available to
`packages/database`'s tests and to `apps/api`/`apps/worker` in dev, without needing a
second copy of `.env` inside any individual package. Ambient environment variables (e.g.
ones a CI service container sets) always win over the `.env` file's values, never the
reverse.

**Prisma commands** (run from the repo root via `scripts/pnpm.ps1`, or `cd
packages/database` first):

```powershell
.\scripts\pnpm.ps1 --filter "@automationdm/database" run migrate:dev    # new migration from schema changes
.\scripts\pnpm.ps1 --filter "@automationdm/database" run generate       # regenerate the Prisma client only
.\scripts\pnpm.ps1 --filter "@automationdm/database" run seed           # re-run the dev seed (idempotent)
.\scripts\pnpm.ps1 --filter "@automationdm/database" run test           # vitest, against the running local DB
```

**A real Windows bug found and fixed while building this** (full detail in the ADR): the
first version of the `start` command hung indefinitely — `pg_ctl start` spawns
`postgres.exe` as a background process, and on Windows that grandchild process can inherit
`pg_ctl`'s own stdout/stderr pipe handles, so Node's `spawnSync` waited forever for those
pipes to close even though the server was already up and `pg_ctl` itself had exited. Fixed
by not piping that specific call's output at all (`stdio: 'ignore'` — the server's own
output already goes to a log file via `pg_ctl -l`).

## Phase 2 update (2026-08-10): application dev commands, and a PATH gotcha

Each app now has real `dev`/`build`/`start` scripts (via `pnpm --filter <name> run <script>`,
or through `scripts/dev.ps1` for all three at once):

| App | Dev | Build | Start (after build) |
|---|---|---|---|
| `apps/web` | `pnpm --filter @automationdm/web run dev` → http://localhost:3000 | `... run build` | `... run start` |
| `apps/api` | `pnpm --filter @automationdm/api run dev` → http://localhost:4000/api/health | `... run build` (`nest build`) | `node apps/api/dist/main.js` |
| `apps/worker` | `pnpm --filter @automationdm/worker run dev` | `... run build` (`tsc`) | `node apps/worker/dist/main.js` |

**Important — always go through `scripts/*.ps1`, or explicitly prepend `.tools/node` to
`PATH`, before invoking `pnpm`/`corepack` directly.** During Phase 2 verification, running
`.\.tools\node\corepack.cmd pnpm ...` directly in a fresh PowerShell session — without first
running `$env:PATH = ".tools\node;$env:PATH"` — invoked the right `pnpm`, but `pnpm` then
spawned each script's process (`next build`, `nest build`, `tsc`) using whatever `node` was
*first on that session's PATH*, which was still the machine's global Node 16. `next build`
explicitly checks `process.version` and refused to run ("Node.js version \">=20.9.0\" is
required"), which is what surfaced the bug; `nest build`/`tsc` have no such check and ran
"successfully" under Node 16 anyway, silently, which is arguably worse. `scripts/_env.ps1`
(sourced by every `scripts/*.ps1`) already does this `PATH` prepend correctly — the bug was
only in bypassing those wrapper scripts for ad hoc verification commands. **Takeaway: never
assume a `pnpm run <script>` invocation ran under the intended Node version just because it
exited 0 — either use the wrapper scripts, or verify `node --version` inside the same shell
session first.**

## Authentication (Phase 5, 2026-08-10/11)

Full decision record: `docs/ADR/0004-authentication-provider.md`. Short version: Auth.js
(`next-auth@5`), `Credentials` provider (email + bcrypt-hashed password) — open-source,
free, self-hosted, no external account/OAuth-app registration needed.

**Setup**, beyond what Phase 4 already requires (local Postgres running):

```powershell
# Generate your own local AUTH_SECRET (not an external credential - a session-signing key
# only this app ever sees) and put it in your local .env:
powershell -NoProfile -Command "$b=New-Object byte[] 32; (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); [Convert]::ToBase64String($b)"
```

Then sign up at `http://localhost:3000/sign-up`, or sign in at `/sign-in` if you already have
an account — both are real, working flows against the local Postgres, not placeholders.

**A real port-collision bug found and fixed while manually testing this in a browser** (per
`CLAUDE.md`'s "start the dev server and use the feature in a browser" rule): `apps/web`'s
`dev`/`start` scripts used to be plain `next dev`/`next start`, which fall back to reading
the `PORT` env var when no `-p` flag is given. Since Phase 4's `Import-DotEnv` loads the
whole repo-root `.env` — including `PORT=4000`, which is meant for `apps/api` — into every
`scripts/pnpm.ps1`-wrapped process's environment, `apps/web` was silently also trying to
bind port `4000`, colliding with `apps/api`. Fixed by pinning `apps/web`'s scripts to
`next dev -p 3000` / `next start -p 3000` — an explicit CLI flag always wins over the `PORT`
env var (confirmed via Next's own bundled CLI reference docs), so this is a small, local fix
that doesn't touch `Import-DotEnv` or `apps/api`'s use of `PORT` at all.

**Next.js 16 renamed `middleware.ts` to `proxy.ts`** (same API, new file-naming convention;
the old name still works but logs a deprecation warning with a codemod pointer) — this
project uses the new name (`apps/web/src/proxy.ts`) since Phase 5 is new code, not a
migration.

## Multi-tenancy (Phase 6, 2026-08-11)

Full design: `docs/ARCHITECTURE.md`'s "Session verification (Phase 6)" section. Short
version: `apps/api` gained its first guarded endpoints (`organizations`), verified via a
short-lived internal bearer token `apps/web` mints after checking the Auth.js session — not
by `apps/api` decoding Auth.js's own session cookie.

**Setup**, beyond Phase 4 (Postgres) and Phase 5 (`AUTH_SECRET`):

```powershell
# Generate your own local API_INTERNAL_SECRET the same way as AUTH_SECRET - a distinct
# secret, not an external credential:
$b=New-Object byte[] 32; (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); [Convert]::ToBase64String($b)
```

Put the result in your local `.env` as `API_INTERNAL_SECRET=...`. Both `apps/web` and
`apps/api` need it (via `Import-DotEnv`, same as every other `.env` value).

**Running `apps/api`'s test suite** (its first — Vitest + Supertest against the real local
Postgres, same as `packages/database`'s):

```powershell
.\scripts\db.ps1 start   # if not already running
.\scripts\pnpm.ps1 --filter @automationdm/api run test
```

**A real NestJS+Vitest gap found while wiring this up**: the first test run failed every
endpoint that used constructor-injected services (`Cannot read properties of undefined
(reading 'create')`) even though the exact same code built and ran correctly under `nest
build`/`nest start`. Cause: NestJS's dependency injection resolves constructor parameter
types via TypeScript's `emitDecoratorMetadata` (`design:paramtypes`), but Vitest's default
transform is esbuild-based and doesn't emit that metadata — every constructor-injected
provider silently resolved to `undefined`. This is a known NestJS+Vitest interaction, not a
bug in this repo's code; NestJS's own docs (`docs.nestjs.com/recipes/swc#vitest`) recommend
the fix used here: `unplugin-swc` + `@swc/core` as a Vite plugin in `apps/api/vitest.config.ts`
(`plugins: [swc.vite({ module: { type: 'es6' } })]`), which routes Vitest's TS transform
through SWC instead of esbuild.

**A second real bug found while manually testing this in a browser**: the automated test
suite's `beforeEach` does a full table reset (same pattern as `packages/database`'s tests) —
running it against the shared local dev Postgres deleted the manually-created accounts from
the *previous* phase's browser testing session. Not a bug in the product, but a reminder that
this dev database is genuinely shared, disposable state (`docs/ADR/0003-local-postgresql-strategy.md`)
across both automated tests and manual sessions — sign up again rather than expecting an
old session's account to still exist after running the test suite.

## Instagram account connection (Phase 8, 2026-08-11)

Full design: `docs/ARCHITECTURE.md`'s "Instagram connect flow" section;
`docs/ZERNIO-INTEGRATION.md`'s "Account connection" section for the real, verified Zernio
API calls involved.

**Setup**, beyond Phase 4/5/6's requirements:

```
ZERNIO_API_KEY=sk_...   # from your Zernio dashboard - a real external credential
APP_URL=http://localhost:3000
```

`ZERNIO_API_KEY` is only needed for the connect flow to actually reach Zernio - the rest of
the app, and the automated test suite (which uses an in-memory fake `InstagramProvider`, per
`docs/TESTING.md`), don't need it.

**A real regression found and fixed during this phase's own Vitest run**: adding a second
`apps/api` e2e test file (`src/instagram/__tests__/instagram.e2e.test.ts`, alongside the
existing `organizations.e2e.test.ts`) caused spurious failures in *both* files —
foreign-key and unique-constraint violations that had nothing to do with either file's own
logic. Cause: Vitest's default file-level parallelism runs multiple test files concurrently
by default, and both files' `beforeEach` does a full table reset against the *same* real
local Postgres — one file's mid-test reset could wipe rows the other file had just created.
Fixed by setting `fileParallelism: false` in `apps/api/vitest.config.ts`, which serializes
test-file execution — the correct fix for a shared-database integration suite, confirmed by
the fact this only ever manifested once there was a second file doing the same kind of reset.

**A real credential problem found during this phase's own manual browser verification, then
resolved**: the `ZERNIO_API_KEY` initially configured in this project's local `.env` was
rejected by Zernio's live API with `401 Unauthorized` on every call, including a plain
`GET /v1/accounts` with no request body - confirmed independently of this project's code via
a bare `curl` call with the same key. Not a bug in `packages/zernio`/`apps/api`; the connect
flow's own error handling worked exactly as designed (a graceful `?instagram=error` banner,
full error logged server-side against a `requestId`, no crash). The replacement key the user
generated was reported **without** the `sk_` prefix Zernio's docs specify - confirmed
required via a direct `curl` comparison (bare key → `401`, `sk_`-prefixed → `200`) before
fixing `.env`. After the fix, a full live verification (real Zernio profile creation, a real
redirect to `instagram.com`'s login screen, and the callback path proven against a real,
already-connected account) succeeded - see `docs/IMPLEMENTATION-ROADMAP.md`'s Phase 8 report
for the full account.
