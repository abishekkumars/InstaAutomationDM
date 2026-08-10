# apps/web

Next.js (App Router, TypeScript, Tailwind CSS v4) frontend. Scaffolded in Phase 2 as a
featureless, responsive shell; Phase 5 added real authentication (Auth.js). shadcn/ui
components land when the first real form/data UI beyond auth needs them, not before.

## Structure

- `src/app/layout.tsx` — root layout: responsive header/main/footer shell, shows the signed-
  in user's email + a sign-out button, or a sign-in link.
- `src/app/page.tsx` — dashboard placeholder (auth-protected via `src/proxy.ts`).
- `src/app/status/page.tsx` — server-rendered page that fetches `apps/api`'s
  `GET /api/health` and shows whether the API is reachable; demonstrates the
  `NEXT_PUBLIC_API_URL` env wiring end to end. Public — not auth-protected.
- `src/lib/env.ts` — small env accessor (`getApiUrl()`).
- `src/auth.config.ts` / `src/auth.ts` — Auth.js (`next-auth@5`) configuration, split in two
  because `src/proxy.ts` runs on the Edge runtime (no Prisma/bcrypt there) while everything
  else runs on the Node runtime. See `docs/ADR/0004-authentication-provider.md`.
- `src/proxy.ts` — Next.js 16's route-protection convention (formerly `middleware.ts`);
  redirects unauthenticated requests to `/sign-in` for every route except `/sign-in`,
  `/sign-up`, `/status`, and Auth.js's own `/api/auth/*`.
- `src/app/(auth)/actions.ts` — server actions: `signInAction`, `registerAction`,
  `signOutAction`.
- `src/app/sign-in/`, `src/app/sign-up/` — the sign-in/sign-up pages and their client-side
  form components.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js's own route handler.

## Development

```powershell
pnpm --filter @automationdm/web run dev     # http://localhost:3000
pnpm --filter @automationdm/web run build
```

Port is pinned via `-p 3000` in both the `dev` and `start` scripts — `apps/api` reads a
`PORT` env var from the shared `.env`, and without an explicit `-p`, Next's CLI would pick
up that same ambient `PORT` and try to bind `apps/web` to `4000` too (found while manually
testing Phase 5's sign-in flow; see `docs/IMPLEMENTATION-ROADMAP.md`'s Phase 5 report).

Requires `AUTH_SECRET` in `.env` (generate your own locally — see `.env.example`) and the
local Postgres running (`.\scripts\db.ps1 start`) for anything that touches sign-in/sign-up.

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the project-local
Node/pnpm setup these commands run through.
