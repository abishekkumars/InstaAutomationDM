# apps/api

NestJS backend (REST). Scaffolded in Phase 2 as a minimal shell (config validation, a
global exception filter, a request-id middleware, a health endpoint); Phase 4 added a real
database connection. Still no auth, no Redis, no Zernio, no automation engine.

## Structure

- `src/main.ts` — bootstrap: sets the `/api` global prefix, request-id middleware, global
  exception filter, `app.enableShutdownHooks()` (so the database disconnects cleanly on
  shutdown).
- `src/app.module.ts` — root module: `ConfigModule` (validated via
  `src/config/env.validation.ts`) + `DatabaseModule` + `HealthModule`.
- `src/database/` — `DatabaseModule` (`@Global()`) + `PrismaService`, wrapping
  `@automationdm/database`'s client singleton with Nest's `OnModuleInit`/`OnModuleDestroy`.
- `src/health/` — `GET /api/health` (liveness, always `200` if the process is up) and
  `GET /api/ready` (runs `SELECT 1` through `PrismaService`; `503` if the database is
  unreachable — see `docs/API-SPEC.md`).
- `src/common/middleware/request-id.middleware.ts` — reads/generates `X-Request-Id`,
  attaches it to the request for logging and to every error response.
- `src/common/filters/all-exceptions.filter.ts` — catches all exceptions, responds with
  `{ error: { code, message, requestId } }` (see `docs/API-SPEC.md`/`docs/SECURITY.md`),
  logs full detail server-side only.

Planned modules, introduced per `docs/IMPLEMENTATION-ROADMAP.md`: auth, organizations,
users, members, instagram, zernio, webhooks, automations, automation-engine, contacts,
conversations, messages, analytics, usage, billing, notifications, audit.

Requires the local database running first: `.\scripts\db.ps1 start` (see
[docs/ADR/0003-local-postgresql-strategy.md](../../docs/ADR/0003-local-postgresql-strategy.md)).

## Development

```powershell
pnpm --filter @automationdm/api run dev     # http://localhost:4000/api/health
pnpm --filter @automationdm/api run build
```

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the project-local
Node/pnpm setup these commands run through.
