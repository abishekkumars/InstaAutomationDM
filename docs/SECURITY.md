# Security

Status: Phase 0 baseline. Expanded and re-verified in Phase 21 (Security hardening), but
these rules apply from the very first line of code, not just at the end.

## Secrets

- Never hardcoded, never committed. All secrets via environment variables, documented
  (name + purpose, not value) in `.env.example`.
- Never logged: API keys, OAuth secrets, access/refresh tokens, passwords. Structured
  logging must redact these fields by name (`apiKey`, `accessToken`, `refreshToken`,
  `password`, `secret`, `*Secret`, `*Token`) at the logger transport level, not by
  remembering to omit them at every call site.
- Zernio API key and webhook secret are used only inside `packages/zernio` /
  `apps/api`'s webhooks module — never sent to `apps/web`, never returned in any API
  response body.
- Instagram passwords are never stored, never seen — connection is OAuth via Zernio; we
  only ever hold Zernio-issued account identifiers/tokens server-side.

## Tenant isolation

See `docs/DATABASE.md` and `docs/ARCHITECTURE.md`. `organization_id` is always derived from
the authenticated session's membership, never trusted from client input (path param, body,
or query string). Covered by explicit cross-tenant tests, not just review.

## AuthN/AuthZ

- AuthN: Auth.js (`next-auth@5`), `Credentials` provider — email + password, hashed with
  `bcryptjs` (cost factor 12) before it ever touches the database; the plaintext password is
  never logged, persisted, or returned in any response. Runs entirely server-side inside
  `apps/web`; session is a signed JWT (`AUTH_SECRET`, local-only env var, never committed).
  Chosen over Clerk (paid, external account, not self-hosted) and over wiring an OAuth
  provider (would require external app registration + credentials from the user before this
  phase could proceed) — full reasoning in `docs/ADR/0004-authentication-provider.md`. This
  is specifically about *this project's own* user accounts — unrelated to, and does not
  change, the Instagram-password rule below.
- AuthZ: role-based within an organization (owner/admin/member — exact roles finalized
  Phase 6), enforced at the NestJS service layer via guards, not just hidden in the UI.
  `apps/api` has no protected endpoints yet, so guard implementation is deferred to Phase 6.

## Webhooks

- Signature verification mandatory once `ZERNIO_WEBHOOK_SECRET` is set (see
  `docs/WEBHOOKS.md`), timing-safe comparison.
- Idempotent processing via the `webhook_events` unique constraint.

## Input validation

- All external input (API request bodies, webhook payloads) validated with Zod schemas
  from `packages/validation` before touching business logic.
- API rate limiting at the NestJS layer (per-org and per-IP) — exact limits set once we
  have real Zernio rate-limit numbers (Phase 12) and real usage patterns.

## Transport/session security

- HTTPS everywhere in any deployed environment (Cloudflare in front in production).
- Secure, `httpOnly`, `SameSite` cookies for session state.
- CSRF protection on any state-changing endpoint reachable from a browser session cookie.
- CORS restricted to known frontend origins (no wildcard) once `apps/web`'s deployed origin
  is known.
- Standard security headers (CSP, `X-Content-Type-Options`, `X-Frame-Options`/frame-ancestors,
  HSTS in production) via NestJS middleware (e.g. `helmet`).

## Audit logging

`audit_logs` table (Phase 15/21) records security-relevant actions (account connect/
disconnect, automation create/delete, member invite/role change, billing changes) with
actor, org, timestamp, action, and target — never secret values.

## Error responses

Never leak stack traces, internal file paths, SQL, or library versions to API responses in
production. A generic error shape + a server-side correlation id (`requestId`) that maps to
the detailed structured log entry.

## Dependency hygiene

`npm audit`/equivalent run in CI (Phase 1 CI setup) on every PR; no direct commits that
introduce a dependency with a known critical CVE without a documented reason.

## This is a living document

Every phase that touches auth, webhooks, or tenant data should re-read this file first and
extend it if a new consideration comes up — not treat it as fixed at Phase 0.
