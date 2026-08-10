# apps/web

Next.js (App Router, TypeScript, Tailwind CSS v4) frontend. Scaffolded in Phase 2 as a
featureless, responsive shell — no auth, no Instagram/Zernio/DB/Redis/automation
functionality yet. shadcn/ui components land when the first real form/data UI needs them
(Phase 5+), not before.

## Structure

- `src/app/layout.tsx` — root layout: responsive header/main/footer shell.
- `src/app/page.tsx` — dashboard placeholder.
- `src/app/status/page.tsx` — server-rendered page that fetches `apps/api`'s
  `GET /api/health` and shows whether the API is reachable; demonstrates the
  `NEXT_PUBLIC_API_URL` env wiring end to end.
- `src/lib/env.ts` — small env accessor (`getApiUrl()`).

## Development

```powershell
pnpm --filter @automationdm/web run dev     # http://localhost:3000
pnpm --filter @automationdm/web run build
```

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the project-local
Node/pnpm setup these commands run through.
