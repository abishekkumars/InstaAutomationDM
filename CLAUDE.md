# CLAUDE.md

Operating rules for Claude Code (and any AI agent) working in this repository. Read this
file, plus the relevant `docs/*.md`, before writing or changing any code.

## What this project is

A small, internal-use Instagram comment-automation tool built on the Zernio API — roughly
3-4 users, under 1,000 API calls/month. Simplified from an originally broader SaaS scope; see
`docs/ADR/0005-simplified-mvp-architecture.md`. Full context: `docs/PRODUCT-REQUIREMENTS.md`.
Architecture: `docs/ARCHITECTURE.md`. Current phase status: `docs/IMPLEMENTATION-ROADMAP.md`.

## Before coding, every time

1. Read `docs/IMPLEMENTATION-ROADMAP.md` to know the current phase and what's already done.
2. Read the doc(s) relevant to the area you're touching (`docs/DATABASE.md` for schema
   changes, `docs/ZERNIO-INTEGRATION.md` before touching `packages/zernio`,
   `docs/AUTOMATION-ENGINE.md` before touching `packages/automation-engine`, etc.).
3. Inspect the current implementation of the area you're about to change — don't assume the
   docs are 100% in sync with the code; if they've drifted, fix the doc as part of your
   change.
4. Identify what your change depends on and what depends on it.
5. State your plan (what, why, files, risks, test plan) before large changes.
6. Implement the smallest useful change that makes progress on the current phase — not the
   whole phase in one shot if it can be usefully split, and never work ahead into a later
   phase's scope without saying so first.
7. Run tests, lint, and typecheck (`scripts/test.ps1`, `scripts/lint.ps1`) via the
   project-local tooling — never assume global `node`/`npm` on this machine (see
   `docs/DEVELOPMENT-SETUP.md`; the global install here is Node 16 and must not be used or
   modified). For anything not covered by an existing `scripts/*.ps1`, use
   `scripts/pnpm.ps1 <args>` — never invoke `pnpm`, `corepack`, or `node` directly; a
   direct invocation can silently run under the wrong Node even when the command itself
   "succeeds" (see `docs/DEVELOPMENT-SETUP.md`, "Enforcing the project-local Node
   runtime"). Run `scripts/doctor.ps1` whenever you need to confirm which Node a shell is
   actually using.
8. Fix failures. Never report a feature as working without having actually run it.
9. Update the relevant docs (including `docs/IMPLEMENTATION-ROADMAP.md` checkboxes) as part
   of the same change, not as a follow-up someone else has to remember to do.
10. Report: changed files, tests executed (and their result), remaining known issues.

## Hard rules (do not violate even if asked)

- Never hardcode or commit secrets. Everything sensitive is an environment variable,
  documented (name + purpose) in `.env.example`, never with a real value.
- Never expose Zernio API credentials or Instagram tokens to `apps/web`/the browser.
- Never store Instagram passwords — connection is OAuth via Zernio only.
- Every query touching tenant-owned data enforces `organization_id` scoping, derived
  server-side from the authenticated session — never from client input.
- The `/webhooks/zernio` HTTP handler validates the signature, persists a `webhook_events`
  row for idempotency, then may execute the matched automation's actions in-process
  (no queue/worker infrastructure — see `docs/ADR/0005-simplified-mvp-architecture.md`).
  Keep it fast regardless: never more than the DB insert plus the small, bounded number of
  Zernio REST calls one automation's actions require — no unbounded loops, no fan-out.
- Never execute user-supplied code as part of automation handling — the automation shape is
  fixed and versioned (`docs/AUTOMATION-ENGINE.md`), not a user-scriptable engine.
- Never install anything globally on this machine (`npm install -g ...`) and never modify
  the global Node 16 install — everything project-specific lives inside this repo
  (`docs/DEVELOPMENT-SETUP.md`).
- Never invent Zernio API behavior — check `docs/ZERNIO-INTEGRATION.md` and, if it's
  insufficient or possibly stale, the live docs at docs.zernio.com, before implementing
  anything that calls Zernio.
- Do not build multiple phases' worth of feature in one change. Do not silently change
  architecture — if a phase turns up a reason the documented architecture doesn't work,
  write an ADR in `docs/ADR/` and flag it, don't just diverge.

## When to stop and ask the user instead of proceeding

- Before enabling any paid/external service (Clerk, a managed Postgres/Redis provider,
  Cloudflare R2, Sentry, etc.) or creating any external account.
- Before any migration that could destroy existing data.
- Before any destructive git operation, force-push, or history rewrite.
- Before a change that contradicts something already decided in `docs/ARCHITECTURE.md` or
  an existing ADR.
- Credentials of any kind are required from the user.

Everything else — routine implementation decisions within an already-agreed phase — proceed
without asking.

## Repo-specific facts worth remembering

- This machine: Windows, no admin rights, global Node 16, no Docker. Project tooling is
  entirely self-contained under `.tools/` and `scripts/*.ps1` — see
  `docs/DEVELOPMENT-SETUP.md`.
- Never run `pnpm`/`corepack`/`node` directly. Use `scripts/setup.ps1`, `scripts/dev.ps1`,
  `scripts/lint.ps1`, `scripts/test.ps1`, or `scripts/pnpm.ps1 <args>` for anything else.
  `scripts/doctor.ps1` reports exactly what Node a shell resolves to if in doubt.
- Keep every `scripts/*.ps1` file plain ASCII (no em dashes, curly quotes, arrows) — Windows
  PowerShell 5.1 misreads multi-byte characters in BOM-less `.ps1` files and produces
  confusing parse errors. `.md` files are unaffected.
- Local Postgres strategy is decided: project-local `embedded-postgres`, no Docker — see
  `docs/ADR/0003-local-postgresql-strategy.md`. Redis is not part of this project's
  architecture at all — see `docs/ADR/0005-simplified-mvp-architecture.md`.
- Auth provider is decided: Auth.js (`next-auth@5`), `Credentials` provider — see
  `docs/ADR/0004-authentication-provider.md`.
