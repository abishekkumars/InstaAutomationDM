# packages/shared

Cross-cutting TypeScript utilities shared between `apps/web`, `apps/api`, and `apps/worker`.

Builds to `dist/` via `tsc` (`module: commonjs`), the same pattern `packages/database`/
`packages/validation` use, since `apps/web` and `apps/api` both consume it as a real runtime
workspace dependency.

## `signInternalServiceToken` / `verifyInternalServiceToken` (Phase 6)

The apps/web -> apps/api server-to-server auth contract — see
`docs/ARCHITECTURE.md`'s "Session verification (Phase 6)" section for the full reasoning
(why this exists instead of apps/api decoding Auth.js's own session cookie, and why it uses
its own secret, `API_INTERNAL_SECRET`, rather than reusing `AUTH_SECRET`).
