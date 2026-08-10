# apps/api

NestJS backend (REST). Scaffolded in Phase 2 as a minimal shell; Phase 4 added a real
database connection; Phase 6 added its first authenticated, tenant-scoped endpoints; Phase 8
added its first Zernio-backed endpoints (Instagram account connection). Still no Redis, no
automation engine.

## Structure

- `src/main.ts` — bootstrap: sets the `/api` global prefix, request-id middleware, global
  exception filter, `app.enableShutdownHooks()` (so the database disconnects cleanly on
  shutdown).
- `src/app.module.ts` — root module: `ConfigModule` (validated via
  `src/config/env.validation.ts`) + `DatabaseModule` + `AuthModule` + `HealthModule` +
  `OrganizationsModule`.
- `src/database/` — `DatabaseModule` (`@Global()`) + `PrismaService`, wrapping
  `@automationdm/database`'s client singleton with Nest's `OnModuleInit`/`OnModuleDestroy`.
- `src/health/` — `GET /api/health` (liveness, always `200` if the process is up) and
  `GET /api/ready` (runs `SELECT 1` through `PrismaService`; `503` if the database is
  unreachable — see `docs/API-SPEC.md`). No auth required — infra checks, not business data.
- `src/auth/` (Phase 6) — `SessionGuard` (verifies the `apps/web`-minted internal bearer
  token via `@automationdm/shared`, populates `request.user`) and a `@CurrentUser()`
  decorator. See `docs/ARCHITECTURE.md`'s "Session verification (Phase 6)" section for why
  this isn't Auth.js's own session cookie.
- `src/organizations/` (Phase 6) — `POST /api/organizations`, `GET /api/organizations`,
  `GET /api/organizations/:id/members`, all behind `SessionGuard`. `listMembers` is this
  repo's first real tenant-isolation enforcement: it 404s for any organization the caller
  isn't a member of, real or not.
- `src/instagram/` (Phase 8) — `POST .../connect`, `POST .../callback`, `GET .../accounts`
  under `organizations/:organizationId/instagram`, all behind `SessionGuard`, same 404-if-
  not-a-member pattern as `organizations`. `INSTAGRAM_PROVIDER` is a DI token bound to a real
  `ZernioInstagramProvider` (`@automationdm/zernio`) here — tests override it with an
  in-memory fake, never a live Zernio call (see `docs/TESTING.md`).
- `src/config/app-url.ts` (Phase 8) — `getAppUrl()`, apps/api's own view of where `apps/web`
  is reachable, used to build the Zernio OAuth `redirect_url` server-side rather than
  trusting a client-supplied one.
- `src/common/middleware/request-id.middleware.ts` — reads/generates `X-Request-Id`,
  attaches it to the request for logging and to every error response.
- `src/common/filters/all-exceptions.filter.ts` — catches all exceptions, responds with
  `{ error: { code, message, requestId } }` (see `docs/API-SPEC.md`/`docs/SECURITY.md`),
  logs full detail server-side only.

Planned modules, introduced per `docs/IMPLEMENTATION-ROADMAP.md`: webhooks, automations,
automation-engine. Per `docs/ADR/0005-simplified-mvp-architecture.md`, there is no
`contacts`, `conversations`, `messages`, `analytics`, `usage`, `billing`, `notifications`, or
`audit` module planned. (`users`/`members` are folded into `organizations` for now — see
`docs/ARCHITECTURE.md`.)

Requires the local database running first: `.\scripts\db.ps1 start` (see
[docs/ADR/0003-local-postgresql-strategy.md](../../docs/ADR/0003-local-postgresql-strategy.md)),
`API_INTERNAL_SECRET` set in `.env` (see `docs/DEVELOPMENT-SETUP.md`'s Phase 6 section) for
anything behind `SessionGuard`, and a valid `ZERNIO_API_KEY` in `.env` for the `instagram`
module's real endpoints (its automated tests use a fake provider and don't need this).

## Development

```powershell
pnpm --filter @automationdm/api run dev     # http://localhost:4000/api/health
pnpm --filter @automationdm/api run build
pnpm --filter @automationdm/api run test    # Vitest + Supertest, needs the local DB running
```

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the project-local
Node/pnpm setup these commands run through, and its Phase 6 section for why `apps/api`'s
`vitest.config.ts` needs `unplugin-swc`.
