# packages/validation

Zod schemas shared between frontend forms and backend DTOs, and used to validate inbound
Zernio webhook payloads.

Builds to `dist/` via `tsc` (`module: commonjs`), the same pattern `packages/database` uses,
because `apps/web` consumes it as a real runtime workspace dependency
(`"@automationdm/validation": "workspace:*"`), not just a typecheck-only placeholder.

## `credentialsSchema` (Phase 5)

Email + password validation for Auth.js's `Credentials` provider — see
`docs/ADR/0004-authentication-provider.md`. Used by both the registration server action and
`apps/web/src/auth.ts`'s `authorize()` callback, so password policy (`MIN_PASSWORD_LENGTH`)
can never drift between the two call sites.
