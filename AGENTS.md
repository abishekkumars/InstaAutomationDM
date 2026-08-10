# AGENTS.md

This file exists for AI coding agents/tools other than Claude Code that may work in this
repository (or for Claude Code itself, since some tooling reads `AGENTS.md` by convention).
The authoritative operating rules are in [`CLAUDE.md`](CLAUDE.md) — read that first. This
file is a short pointer plus anything that isn't Claude-specific.

## Quick orientation

- Product/architecture context: `docs/PRODUCT-REQUIREMENTS.md`, `docs/ARCHITECTURE.md`.
- Current phase: `docs/IMPLEMENTATION-ROADMAP.md`.
- This machine has no admin rights, a global Node 16 install that must not be touched, and
  no Docker. All project tooling is project-local — run `scripts/setup.ps1` once, then
  `scripts/dev.ps1` / `scripts/test.ps1` / `scripts/lint.ps1`. Full detail:
  `docs/DEVELOPMENT-SETUP.md`.

## Rules that apply regardless of which agent/tool you are

- No secrets in code or commits; everything sensitive via env vars in `.env` (see
  `.env.example` for the documented list, never real values).
- No global package installs on this machine.
- Tenant isolation on every query touching org-owned data — see `docs/DATABASE.md` /
  `docs/SECURITY.md`.
- No synchronous automation processing inside the webhook HTTP handler — see
  `docs/WEBHOOKS.md`.
- No arbitrary code execution in the automation engine — see `docs/AUTOMATION-ENGINE.md`.
- Don't invent Zernio API behavior beyond what's documented in `docs/ZERNIO-INTEGRATION.md`
  or the live docs at docs.zernio.com.
- Stop and ask a human before: enabling a paid/external service, creating an external
  account, running a destructive/irreversible git or database operation, or diverging from
  a decision already recorded in `docs/ARCHITECTURE.md` or `docs/ADR/`.

See `CLAUDE.md` for the full before-coding checklist and reporting expectations — it applies
to any agent working here, not just Claude Code specifically.
