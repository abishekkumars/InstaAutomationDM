# apps/worker

Bootstrap shell for the future BullMQ worker process(es). Scaffolded in Phase 2: process
startup/shutdown handling only — **no Redis or BullMQ connection yet** (that's Phase 11).

## Structure

- `src/main.ts` — bootstrap: logs startup, registers `SIGTERM`/`SIGINT` handlers, keeps the
  process alive.
- `src/processors/` — empty; see [`README.md`](src/processors/README.md) for where each
  future queue consumer (`webhook-processing`, `automation-execution`, `dm-sending`,
  `follow-up`, `analytics`, `notifications`) will live.

## Development

```powershell
pnpm --filter @automationdm/worker run dev
pnpm --filter @automationdm/worker run build
```

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the project-local
Node/pnpm setup these commands run through.
