# packages/database

Prisma schema, migrations, and a shared `PrismaClient` singleton — the only package that
imports `@prisma/client` directly. `apps/api` (and later `apps/worker`) depend on this via
the pnpm workspace protocol; neither talks to Postgres directly.

## Structure

- `prisma/schema.prisma` — `User`, `Organization`, `OrganizationMember` (Phase 4's scope;
  see [docs/DATABASE.md](../../docs/DATABASE.md) for the full reasoning behind every field).
- `prisma/migrations/` — one committed migration so far (`20260810172436_init`).
- `prisma/seed.mjs` — idempotent, dev-only seed data (never runs against `NODE_ENV=production`).
- `src/client.ts` — the `PrismaClient` singleton (hot-reload-safe) + `disconnectPrisma()`.
- `src/index.ts` — public entrypoint: re-exports `@prisma/client` plus the singleton.
- `src/__tests__/database.test.ts` — Vitest integration tests against a real local Postgres.
- `dev/local-db.mjs` — the local Postgres lifecycle (start/stop/status/reset), see
  [docs/ADR/0003-local-postgresql-strategy.md](../../docs/ADR/0003-local-postgresql-strategy.md).

## Commands

```powershell
.\scripts\db.ps1 start                                              # from repo root
pnpm --filter @automationdm/database run migrate:dev                # new migration
pnpm --filter @automationdm/database run generate                   # regenerate client only
pnpm --filter @automationdm/database run seed                       # re-run dev seed
pnpm --filter @automationdm/database run test                       # vitest, against the local DB
pnpm --filter @automationdm/database run build                      # tsc -> dist/ (what apps/api imports)
```

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the full local
Postgres setup procedure.
