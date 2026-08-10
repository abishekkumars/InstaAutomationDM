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
consider C if the user prefers not to manage local binaries. This will be finalized in
Phase 4 (database) and Phase 11 (Redis/BullMQ) — not decided unilaterally here.

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
