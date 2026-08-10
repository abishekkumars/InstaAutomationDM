# ADR 0003: Local PostgreSQL strategy (project-local, no admin, no Docker)

## Status
Accepted (local dev). CI and production strategies below are also decided as part of this
ADR, since they were explicitly in scope for it — CI is implemented now; production is a
documented target, not something provisioned yet (no managed Postgres account exists).

## Context

`docs/ADR/0002-project-local-node-and-no-docker-fallback.md` deferred the local Postgres/
Redis decision to "Phase 4/11 — not decided unilaterally there." This is that decision, for
Postgres only (Redis stays deferred to Phase 11, per this phase's explicit instructions).

Constraints, unchanged since Phase 0: Windows, no administrator rights, Docker not
installed (and installing Docker Desktop is itself an admin-gated, machine-wide change out
of scope for an AI agent to perform unattended — see ADR 0002). Whatever runs Postgres
locally must live entirely inside this repository, the same way the Node runtime does.

## Options considered

**A. Project-local portable PostgreSQL (official EDB binary zip, hand-rolled orchestration
script).** PostgreSQL publishes official Windows binary zip archives (no installer) at
`enterprisedb.com/download-postgresql-binaries`, specifically for exactly this "no admin, no
install-wizard" use case — confirmed via PostgreSQL's own documentation and multiple
independent no-admin-Windows-Postgres guides during research for this ADR. The standard
flow is `initdb` once into a data directory, then `pg_ctl start`/`pg_ctl stop` against it.
This is a real, well-trodden option. The downside is entirely on us: we would have to
hand-write the download/extract/version-pinning logic ourselves (mirroring
`scripts/setup.ps1`'s Node-download logic), with no existing tooling wrapping it.

**B. `embedded-postgres` npm package.** A actively-maintained wrapper
(github.com/leinelissen/embedded-postgres) that distributes the *same* official Postgres
server binaries as platform-specific npm packages (`@embedded-postgres/windows-x64`,
`@embedded-postgres/linux-x64`, `@embedded-postgres/darwin-arm64`, etc., each restricted via
`os`/`cpu` fields so `pnpm install` only ever downloads the one matching the current
machine), installed via a completely normal `pnpm install` — no separate download script
needed, no custom version-pinning logic, and it slots into the exact same "everything comes
in through `pnpm install`" model this repo already uses for every other tool. Verified
directly (not assumed) during this phase: `pnpm install` on this machine correctly pulled
only `@embedded-postgres/windows-x64` (~97 MB, containing real `postgres.exe`, `pg_ctl.exe`,
`initdb.exe`, and their required DLLs — the same binaries Option A would have downloaded by
hand), its `postinstall` script ran without needing any pnpm build-script approval, and the
resulting binaries genuinely run and serve Postgres 17.10 locally with no admin prompt.

**C. Cloud/remote managed dev Postgres (e.g. Neon, Supabase free tier).** Genuinely
simplest from a "does it run on this machine" standpoint — nothing to run locally at all.
Rejected for this phase specifically because `CLAUDE.md`/`AGENTS.md` require explicit user
approval before creating any external account or enabling a paid/external service, and nothing
in this phase's instructions granted that. Also means development requires network
connectivity and hands a third party (even a free tier) data during active development,
which isn't necessary when a fully local option works. Remains available later if the user
ever prefers it over managing local binaries — nothing in this ADR forecloses it.

## Decision

**Option B: `embedded-postgres`, as a devDependency of `packages/database`, wrapping the
official Postgres 17.10 binaries.** It gives Option A's real, official binaries (this is
not a different, less-trustworthy distribution of Postgres — same server, same binary
provenance) without hand-rolling the download/version-pinning logic Option A would have
required, and it's the only option of the three that needs zero new external accounts or
services.

**However, the package's own high-level `start()`/`stop()` JS API is *not* used for
lifecycle control.** Verified by reading its source
(`node_modules/embedded-postgres/dist/index.js`): `start()` spawns `postgres.exe` and holds
the resulting `child_process` handle on the calling `EmbeddedPostgres` instance; `stop()`
sends a kill signal to *that same in-memory handle*. This only works within a single
process's lifetime (e.g. a test runner's global setup/teardown that starts and stops within
one `vitest` run) — it cannot stop a server that an *earlier, separate* CLI invocation
started, which is exactly the workflow a developer needs (`db.ps1 start` once, keep working
across many unrelated terminal commands, `db.ps1 stop` later).

Instead, `packages/database/dev/local-db.mjs` locates the bundled binaries directly (a
filesystem path under `@embedded-postgres/windows-x64`'s installed directory — not module
resolution, since that package's own `exports` map doesn't expose its `package.json` or
`native/` directory as resolvable subpaths) and calls `pg_ctl start` / `pg_ctl stop` /
`pg_ctl status` directly. `pg_ctl` reads/writes the data directory's own `postmaster.pid`,
so these correctly work across separate invocations — this is precisely what `pg_ctl` is
designed for, and it's the same binary Option A would have used by hand.

**A real Windows-specific bug was found and fixed while implementing this**: `pg_ctl start`
spawns `postgres.exe` as a long-lived grandchild process. On Windows, that grandchild (and
its own background worker processes) can inherit `pg_ctl`'s stdout/stderr pipe handles, so
Node's `spawnSync` — which waits for those pipes to *close*, not merely for `pg_ctl` itself
to exit — hung indefinitely even though the server had actually started successfully and
`pg_ctl` itself had already exited (confirmed via the Postgres log file and `Get-Process`
while the Node call was still hanging). Fixed by using `stdio: 'ignore'` specifically for
the `start` call (the server's own output is already redirected to a log file via `pg_ctl
-l`, so nothing is lost) — `stop`/`status`, which don't spawn a new grandchild, keep the
piped output used for their status messages.

## Windows compatibility / no-admin requirement

Confirmed directly, not assumed:
- `pnpm install` requires no elevation — it's the same install we already run for every
  other dependency.
- The `postinstall` script that unpacks the Windows binaries ran without any pnpm
  build-script approval prompt.
- `initdb`/`pg_ctl start`/`pg_ctl stop`/`pg_ctl status` all ran as the current unprivileged
  user, writing only inside `.tools/postgres-data/` (already gitignored since Phase 0, in
  anticipation of exactly this).
- No Windows service is registered; no registry keys are written; nothing outside this
  repository's own directory is touched, mirroring the Node runtime strategy in ADR 0002.
- Only verified on `win32-x64`. `local-db.mjs` has a platform-package lookup table covering
  the other `embedded-postgres` platforms (`darwin-x64/arm64`, `linux-x64/arm64`), but only
  `@embedded-postgres/windows-x64` is an installed direct dependency right now — a future
  contributor on Mac/Linux would need to add their platform's package too. Flagged
  explicitly rather than claimed as tested.

## Developer setup

```powershell
.\scripts\db.ps1 start     # initializes .tools/postgres-data/ on first run, then starts
.\scripts\db.ps1 status    # "server is running (PID: ...)" or "no server running"
.\scripts\db.ps1 stop
.\scripts\db.ps1 reset     # stops (if running) and deletes .tools/postgres-data/ entirely
```

`DATABASE_URL` (in a local `.env`, never committed — see `.env.example`) is
`postgresql://automationdm:automationdm@localhost:5432/automationdm`. The `automationdm`
database itself doesn't need to be created by this script — `prisma migrate dev` creates it
automatically on first run if the server is reachable but that database doesn't exist yet
(standard, documented Prisma Migrate behavior), which is simpler than adding a second
database-creation step here.

## Backup/reset strategy

There is no backup strategy for this database, by design — it is not where real data
lives. `.tools/postgres-data/` is disposable, project-local, and already gitignored.
`.\scripts\db.ps1 reset` deletes it outright; `prisma migrate reset` (via
`pnpm --filter @automationdm/database run migrate:reset`) re-applies every migration plus
the dev seed from scratch without touching the underlying server. Losing this data has no
consequence beyond re-running one of those two commands.

## Security considerations

- `automationdm`/`automationdm` (user/password) is a fixed, publicly-documented,
  localhost-only development credential — not a secret. It matches the same placeholder
  credential `docker-compose.yml` has used since Phase 0, deliberately, so the two possible
  local-Postgres paths (this one, or Docker if the user later installs it) produce the same
  `DATABASE_URL` shape. It is never used anywhere reachable outside `localhost`, and the
  real `DATABASE_URL` still only ever lives in a local, gitignored `.env` —
  `.env.example` keeps the literal instruction from this phase ("Add `DATABASE_URL=`. Do
  not add real credentials.") rather than embedding this value there, with a comment
  pointing here for the actual local default.
- `packages/database`'s Prisma client (`src/client.ts`) logs only `warn`/`error` levels,
  never `query` (which would include bound parameter values) — see docs/DATABASE.md.
  Nothing in this phase logs `DATABASE_URL` itself anywhere.
- `initdb --auth=password` (not `trust`): connections still require the password over the
  wire, matching `embedded-postgres`'s own default auth method — appropriate even for a
  disposable local database, since it's the same code path a real deployed Postgres uses,
  making local testing more representative.

## How CI will use PostgreSQL

`.github/workflows/ci.yml` gains a `postgres:16-alpine` **service container** (GitHub's
Linux runners have Docker available — this local machine does not, which is exactly why
this ADR exists for local dev, but it's not a constraint on GitHub's runners). The job sets
`DATABASE_URL` to point at that service container, runs `prisma migrate deploy`, then the
`packages/database` test suite against it. **This has not been executed remotely** — there
is no `act`/Docker available on this machine to run it locally (unchanged since Phase 0/1),
and no `git push` has been done. It is prepared and documented, not claimed as verified.

## How production can use managed PostgreSQL later

Nothing about this decision is production-facing. `packages/database`'s only contract with
the rest of the app is `DATABASE_URL` (via Prisma's `datasource db { url = env(...) }`) — a
production deployment points that at any real Postgres (Neon, Supabase, RDS, a self-hosted
instance, etc.) and runs `prisma migrate deploy` against it; nothing about the schema,
client, or migration files is aware of, or coupled to, how local dev happens to run
Postgres. Choosing a production provider is a Phase 22 (production deployment) decision,
not this one.

## Consequences

- `packages/database` gains three new devDependencies (`embedded-postgres`,
  `@embedded-postgres/windows-x64`, and transitively their own deps) purely for local dev
  tooling — never imported by any shipped code path, never a production dependency.
- `.tools/postgres-data/` and `.tools/postgres-data.log` are real, disk-consuming local
  state (a fresh Postgres data directory is on the order of tens of MB) — already
  gitignored, and cleanly removable via `reset`.
- Local dev now requires an explicit `.\scripts\db.ps1 start` before anything that touches
  `DATABASE_URL` will work (the API's `/api/ready`, any `packages/database` command, etc.)
  — documented in `docs/DEVELOPMENT-SETUP.md`, not automatic, so a developer isn't
  surprised by an unexpected ~100 MB download or a silently-running background server just
  from `scripts/setup.ps1`.

## Alternatives considered
See "Options considered" above — Option A (raw EDB zip, hand-rolled) and Option C (managed
cloud dev DB) were the two rejected alternatives, for the reasons given there.
