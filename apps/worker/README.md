# apps/worker

Inert placeholder. Scaffolded in Phase 2 as a bootstrap shell for a future BullMQ worker
process; kept in the repo per
[docs/ADR/0005-simplified-mvp-architecture.md](../../docs/ADR/0005-simplified-mvp-architecture.md)
rather than deleted, since this project turned out not to need queue infrastructure at its
actual scale (~3-4 users, <1,000 API calls/month) — webhook processing happens in-process in
`apps/api` instead (see `docs/WEBHOOKS.md`). Not part of the deployment topology
(`docs/DEPLOYMENT.md`); nothing runs this in production.

## Structure

- `src/main.ts` — bootstrap: logs startup, registers `SIGTERM`/`SIGINT` handlers, keeps the
  process alive. Unchanged since Phase 2.
- `src/processors/` — empty, and expected to stay that way unless a concrete future
  requirement makes a background worker actually necessary — see its own `README.md`.

## Development

```powershell
pnpm --filter @automationdm/worker run dev
pnpm --filter @automationdm/worker run build
```

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the project-local
Node/pnpm setup these commands run through.
