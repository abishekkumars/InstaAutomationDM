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

## `createOrganizationSchema` (Phase 6)

Name + slug validation for organization creation — the slug format rule (lowercase
letters/numbers/hyphens) that `docs/DATABASE.md`'s `Organization.slug` field always said was
"an application-layer concern for whichever phase builds org creation." Used by both
`apps/web`'s create-organization form and `apps/api`'s `organizations` module, so the two
can never validate differently.
