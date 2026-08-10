# apps/api

NestJS backend (REST). Scaffolded in Phase 2 as a minimal shell: config validation, a
global exception filter, a request-id middleware, and a health endpoint — no auth, no
database, no Redis, no Zernio, no automation engine yet.

## Structure

- `src/main.ts` — bootstrap: sets the `/api` global prefix, request-id middleware, global
  exception filter.
- `src/app.module.ts` — root module: `ConfigModule` (validated via
  `src/config/env.validation.ts`) + `HealthModule`.
- `src/health/` — `GET /api/health` → `{ status, service, timestamp, uptimeSeconds }`.
- `src/common/middleware/request-id.middleware.ts` — reads/generates `X-Request-Id`,
  attaches it to the request for logging and to every error response.
- `src/common/filters/all-exceptions.filter.ts` — catches all exceptions, responds with
  `{ error: { code, message, requestId } }` (see `docs/API-SPEC.md`/`docs/SECURITY.md`),
  logs full detail server-side only.

Planned modules, introduced per `docs/IMPLEMENTATION-ROADMAP.md`: auth, organizations,
users, members, instagram, zernio, webhooks, automations, automation-engine, contacts,
conversations, messages, analytics, usage, billing, notifications, audit.

## Development

```powershell
pnpm --filter @automationdm/api run dev     # http://localhost:4000/api/health
pnpm --filter @automationdm/api run build
```

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the project-local
Node/pnpm setup these commands run through.
