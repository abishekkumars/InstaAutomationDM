# apps/web

Next.js (App Router, TypeScript, Tailwind CSS v4) frontend. Scaffolded in Phase 2 as a
featureless, responsive shell; Phase 5 added real authentication (Auth.js); Phase 6 added
real organization creation/membership; Phase 8 added the Instagram connect flow; Phase 9
added a posts/reels list + detail view; Phase 10 added comment-automation creation on the
post detail page; Phase 10.1 redesigned the shell (sidebar + dashboard); Phase 10.2b added a
theme switch, a searchable/sortable/virtualized posts browser, and a global loading overlay.
shadcn/ui components land when the first real form/data UI beyond auth/onboarding needs them,
not before.

## Structure

Since Phase 18.1 (`docs/ADR/0010-device-specific-views.md`) routes and presentation are split:

- `src/app/**` — routes only: params/searchParams, auth-dependent redirects, metadata, server
  actions, the shared data layer (`dashboard-data.ts`, `admin/admin-data.ts`), and which view to
  render. `src/lib/device.ts` decides desktop vs mobile (user agent, overridable by the `view`
  cookie). Until Phase 18.2 every request still gets the desktop view.
- `src/views/desktop/**` — the desktop UI (shell, dashboard, posts, post detail, status, admin
  browser, modals). Views may be async server components that stream their own Suspense
  sections from the shared data layer.
- `src/views/mobile/**` — the mobile UI (Phase 18.2 onward): `shell.tsx` (scroll area + glass
  bottom tab bar, Plus Jakarta Sans via `next/font`), `page-header.tsx` (large title that collapses
  into a pinned glass header on scroll), and `listing/` (the Listing tab at `/`) and `dashboard/` (the Dashboard tab at `/dashboard`, mobile only; desktop redirects to `/`), plus `posts/`, `post-detail/`, `status/` and `settings/` (`/settings`, mobile only).
- `src/views/shared/**` — pieces both trees use: loader, toast, toggle, icons, theme switch,
  session-expiry watcher, freshness label, platform badges, `useUrlState`.

Notable files:

- `src/app/layout.tsx` — root layout: `<html>`/`<body>`, the signed-out shell, and the signed-in
  body (`h-dvh overflow-hidden`), which renders `src/views/desktop/shell.tsx`'s `DesktopShell` —
  fixed sidebar + fixed top bar, with scrolling delegated to the content pane only (the
  `min-h-0` on the flex child is load-bearing — a flex item defaults to `min-height:auto` and
  refuses to shrink below its content, which puts the scrollbar back on the page). Shows the
  signed-in user, a sign-out button, and the theme switch.
- `src/views/desktop/automations-browser.tsx` (Phase 10.3) — the dashboard's automations table
  as a client component: search (name/keywords/account/caption), sort (most sent, most clicks,
  name, enabled-first), post thumbnails, and live sent/click counts. Renders an em dash, never
  a `0`, when `stats` is null — a failed Zernio stats fetch must not read as "sent nothing".
  The `AutomationListItem` shape lives in `src/app/dashboard-data.ts`, next to the fetcher that
  returns it, so both view trees and the data layer share one definition.
- `src/views/shared/theme-toggle.tsx` (Phase 10.2b) — Light/Auto/Dark switch. "Auto" removes the
  `data-theme` attribute rather than resolving it, so the page keeps following the OS. The
  stored choice is applied by `ThemeScript`, inlined into `<head>` so it runs *before first
  paint* — a React effect runs after paint and would flash the wrong theme. See the three
  theme states documented in `src/app/globals.css`.
- `src/views/shared/loader.tsx` (Phase 10.2b) — the loading overlay (blurred backdrop + spinner).
  `callApi` is server-side only, so there is no client fetch to attach a spinner to: every
  API call is either a server render (a navigation) or a server action (a form submit), and
  these components track exactly those two via `useLinkStatus`/`useFormStatus`. Use
  `LoadingLink` instead of `next/link` for any link that changes page. The spinner's CSS
  lives in `globals.css` as `.loader` — note its animation is deliberately **not** named
  `spin`, which would collide with Tailwind's own `@keyframes spin` and silently replace it.
- `src/app/page.tsx` → `src/views/desktop/dashboard/dashboard-view.tsx` — dashboard: calls
  `apps/api` for the caller's organizations; shows the "waiting for access" state if there are
  none (Phase 15.3 removed `/onboarding`), otherwise the stats, accounts, automations and team
  sections, degrading gracefully (a message, not a crash) if `apps/api` is unreachable — same
  philosophy as `/status`.
- `src/app/instagram/` (Phase 8) — `actions.ts`'s `connectInstagramAction` (calls
  `POST .../instagram/connect`, redirects the browser to the returned `authUrl` - a real
  redirect to an external origin) and `callback/page.tsx` (where Zernio redirects the
  browser back to; forwards the result to `POST .../instagram/callback` then redirects to
  `/` with a `?instagram=connected|error` banner). Sits behind the normal authenticated-
  session requirement like every other page - not a public webhook-style endpoint.
  `posts/page.tsx` (Phase 9; reworked in Phase 10.2b) — a connected account's existing
  posts/reels, linked from the dashboard's account list via `?accountId=`. It fetches the
  account's **whole** synced window in one call (limit 500, Zernio's own max) rather than one
  server page at a time, because Zernio's list endpoint has no search or sort parameters, so
  both happen client-side — and they must cover every post, not just the visible page, or
  "search" would silently only search one page. `src/views/desktop/posts/posts-browser.tsx` owns that UI:
  card/list toggle, caption search, newest/oldest sort, page size, numbered jump pagination,
  and a windowed virtual scroller. The scroller's fixed row heights (88px list / 248px grid)
  must stay in step with the card contents, or content drifts against the scrollbar.
  `posts/[postId]/page.tsx` (Phase 9: caption, media, permalink; Phase 10: a comment-
  automation section — shows the existing automation if one exists, otherwise a create
  button) + `src/views/shared/automation/create-automation-modal.tsx` (Phase 10.1; shared with the mobile view since Phase 18.4) — a 3-step modal wizard.
  Because each step is conditionally rendered, React unmounts the off-screen steps, and an
  unmounted input is absent from `FormData`; **every submitted value therefore lives in an
  always-mounted hidden field**, and the visible inputs carry no `name` (Phase 10.2b — this
  was a real bug that made every submit fail validation). `[postId]/actions.ts` (Phase 10)
  `createAutomationAction` posts to `.../automations`. Both pages read the caller's _active_
  organization via `getActiveOrganizationId()` (`src/lib/organization.ts`). That is the one
  picked in the sidebar organization switcher (an `org` cookie, re-validated against the caller's
  memberships on every read), or else their first membership.
- `src/app/status/page.tsx` (view: `src/views/desktop/status/status-view.tsx`) — server-rendered page that fetches `apps/api`'s
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
  organization yet" check is a separate, live check in the dashboard view — not something a
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
