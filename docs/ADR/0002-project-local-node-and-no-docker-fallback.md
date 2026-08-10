# ADR 0002: Project-local Node.js runtime; Docker/Postgres/Redis fallback deferred

## Status
Accepted (Node runtime strategy) / Open (local Postgres+Redis choice — deferred to Phase 4/11)

## Context
The development machine has Node 16.13.0 installed globally, no administrator rights, and
no Docker installation (see `docs/DEVELOPMENT-SETUP.md` for the full inspection). The
target stack (Next.js 16.x, NestJS 11.x) requires Node ≥ 20. The user's machine may host
other projects that depend on the existing global Node 16 — master prompt sections 3 and
2.27-2.30 explicitly forbid touching it.

## Decision
1. Download a pinned Node 24.x (Active LTS) **zip** distribution (not the installer) into
   `.tools/node/` inside the repository. All project scripts use this copy exclusively via
   a per-process `PATH` prepend; the global Node 16 is never modified, upgraded, or removed.
2. Manage pnpm through the corepack that ships inside that project-local Node, pinned via
   the root `package.json`'s `packageManager` field — no global `npm install -g pnpm`.
3. For Postgres/Redis, since Docker isn't installed and installing Docker Desktop is itself
   an admin-gated, machine-wide change out of scope for unattended execution: defer the
   final choice between (a) the user installing Docker Desktop themselves, (b) portable
   local binaries under `.tools/`, or (c) a cloud free-tier dev database, to Phase 4/11.
   `docker-compose.yml` is still authored now as forward-looking infra-as-code for whichever
   machine eventually has Docker available (this one, or a future one), but is not expected
   to run on the current machine yet.

## Consequences
- Any contributor/agent on this machine gets a working, correct-version Node/pnpm without
  needing IT/admin involvement, and without any risk to other Node 16-dependent projects on
  the same machine.
- `.tools/node/` must stay out of git (large binary, machine/OS-specific) — added to
  `.gitignore`.
- Local Postgres/Redis remains genuinely unresolved until Phase 4/11; this ADR intentionally
  does not pretend to have decided it, per the rule that "an external account must be
  connected" and "a paid external service must be enabled" are stop-and-ask triggers, not
  something to unilaterally provision.

## Alternatives considered
- `nvm-windows` — commonly requires elevation for its machine-wide symlink management;
  rejected for the same no-admin reason as installing Node globally.
- Requiring the user to get admin rights / IT to install Docker before Phase 0 could
  complete — rejected; Phase 0's job is to work with the machine as it actually is.
