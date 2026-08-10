# apps/web

Next.js (App Router, TypeScript, Tailwind CSS v4) frontend. Scaffolded in Phase 2 as a
featureless, responsive shell; Phase 5 added real authentication (Auth.js); Phase 6 added
real organization creation/membership; Phase 8 added the Instagram connect flow. shadcn/ui
components land when the first real form/data UI beyond auth/onboarding needs them, not
before.

## Structure

- `src/app/layout.tsx` — root layout: responsive header/main/footer shell, shows the signed-
  in user's email + a sign-out button, or a sign-in link.
- `src/app/page.tsx` (Phase 6) — dashboard: calls `apps/api` for the caller's organizations;
  redirects to `/onboarding` if there are none, otherwise shows the first org's name/slug/
  role and member list, degrading gracefully (a message, not a crash) if `apps/api` is
  unreachable — same philosophy as `/status`.
- `src/app/onboarding/` (Phase 6) — create-organization form (calls
  `POST /api/organizations` via `src/lib/api.ts`), shown to any signed-in user with zero
  organizations.
- `src/app/instagram/` (Phase 8) — `actions.ts`'s `connectInstagramAction` (calls
  `POST .../instagram/connect`, redirects the browser to the returned `authUrl` - a real
  redirect to an external origin) and `callback/page.tsx` (where Zernio redirects the
  browser back to; forwards the result to `POST .../instagram/callback` then redirects to
  `/` with a `?instagram=connected|error` banner). Sits behind the normal authenticated-
  session requirement like every other page - not a public webhook-style endpoint.
- `src/app/status/page.tsx` — server-rendered page that fetches `apps/api`'s
  `GET /api/health` and shows whether the API is reachable; demonstrates the
  `NEXT_PUBLIC_API_URL` env wiring end to end. Public — not auth-protected.
- `src/lib/env.ts` — small env accessor (`getApiUrl()`).
- `src/lib/api.ts` (Phase 6) — `callApi()`: signs a short-lived internal bearer token (via
  `@automationdm/shared`) from the current Auth.js session and calls `apps/api`. Server-side
  only. See `docs/ARCHITECTURE.md`'s "Session verification (Phase 6)" section.
- `src/auth.config.ts` / `src/auth.ts` — Auth.js (`next-auth@5`) configuration, split in two
  because `src/proxy.ts` runs on the Edge runtime (no Prisma/bcrypt there) while everything
  else runs on the Node runtime. See `docs/ADR/0004-authentication-provider.md`.
- `src/proxy.ts` — Next.js 16's route-protection convention (formerly `middleware.ts`);
  redirects unauthenticated requests to `/sign-in` for every route except `/sign-in`,
  `/sign-up`, `/status`, and Auth.js's own `/api/auth/*`. (The "does this user have an
  organization yet" check is a separate, live check in `src/app/page.tsx` — not something a
  middleware pass can answer without calling the API on every request.)
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

Requires `AUTH_SECRET` and `API_INTERNAL_SECRET` in `.env` (generate your own locally — see
`.env.example`), the local Postgres running (`.\scripts\db.ps1 start`), and `apps/api`
running (`pnpm --filter @automationdm/api run dev`) for anything past sign-in — the
dashboard/onboarding pages call it.

See [docs/DEVELOPMENT-SETUP.md](../../docs/DEVELOPMENT-SETUP.md) for the project-local
Node/pnpm setup these commands run through.
