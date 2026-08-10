# Security

Status: Phase 6, scope simplified per
`docs/ADR/0005-simplified-mvp-architecture.md`. Expanded and re-verified in Phase 13
(Security hardening, scaled to this app's actual size — ~3-4 users), but these rules apply
from the very first line of code, not just at the end.

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
or query string). Covered by explicit cross-tenant tests, not just review — first proven in
`apps/api/src/organizations/__tests__/organizations.e2e.test.ts` (Phase 6): a real,
authenticated, non-member user requesting another organization's member list gets a plain
`404`, and the test asserts the response body contains none of that organization's data, not
just that the status code is right.

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
- **`apps/api` session verification (Phase 6)**: `apps/api` never sees Auth.js's own session
  cookie. Instead, `apps/web` mints a short-lived (60s), purpose-built bearer token
  (`packages/shared/src/internal-service-token.ts`, HS256) immediately after checking the
  caller's session, signed with `API_INTERNAL_SECRET` — a **separate** secret from
  `AUTH_SECRET` (never reuse one key across two different cryptographic uses/protocols).
  `apps/api`'s `SessionGuard` verifies it and populates `request.user`; every service method
  re-derives `organizationId` from that user's real `OrganizationMember` rows, never from a
  path/body parameter. Full design + why not just decode the Auth.js cookie directly:
  `docs/ARCHITECTURE.md`'s "Session verification (Phase 6)" section.
- AuthZ: role-based within an organization (owner/admin/member — vocabulary exists since
  Phase 4's `OrganizationRole` enum). `SessionGuard` + per-request membership lookups are the
  Phase 6 foundation; role-based permission checks beyond "is a member" (e.g. only an `OWNER`
  can do X) land with whichever future phase first needs that distinction — nothing needs it
  yet, since `organizations`' only mutating endpoint (`POST /api/organizations`) doesn't
  operate on an existing org.

## Webhooks

- Signature verification mandatory once `ZERNIO_WEBHOOK_SECRET` is set (see
  `docs/WEBHOOKS.md`), timing-safe comparison.
- Idempotent processing via the `webhook_events` unique constraint.

## Input validation

- All external input (API request bodies, webhook payloads) validated with Zod schemas
  from `packages/validation` before touching business logic.
- API rate limiting at the NestJS layer (per-org and per-IP) — exact limits set once we
  have real Zernio rate-limit numbers (Phase 8-11, whichever first makes real Zernio calls)
  and real usage patterns. Low priority at this project's actual call volume (<1,000/month).

## Transport/session security

- HTTPS everywhere in any deployed environment — whatever TLS termination the actual host
  provides (no specific reverse proxy/CDN required, see `docs/DEPLOYMENT.md` and
  `docs/ADR/0005-simplified-mvp-architecture.md`).
- Secure, `httpOnly`, `SameSite` cookies for session state.
- CSRF protection on any state-changing endpoint reachable from a browser session cookie.
- CORS restricted to known frontend origins (no wildcard) once `apps/web`'s deployed origin
  is known.
- Standard security headers (CSP, `X-Content-Type-Options`, `X-Frame-Options`/frame-ancestors,
  HSTS in production) via NestJS middleware (e.g. `helmet`).

## Audit logging

No dedicated `audit_logs` table — retired per
`docs/ADR/0005-simplified-mvp-architecture.md` along with the rest of the CRM/billing scope
it was originally paired with. At this project's scale (~3-4 users), structured server logs
(already correlated by `requestId`, see "Error responses" below) are the audit trail for
now; revisit with a real table only if a concrete compliance/traceability requirement
appears.

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
