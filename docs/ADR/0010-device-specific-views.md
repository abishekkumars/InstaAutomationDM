# ADR 0010 — Device-specific view layer (`src/views/desktop`, `src/views/mobile`)

- **Status:** Accepted (2026-09-25). Proposed and approved the same day; implemented in Phases 18.1-18.6.
- **Phase:** 18
- **Supersedes:** nothing. Extends the responsive approach of Phases 10.1, 10.5 and 16.3.

## Context

`apps/web` renders one component tree for every screen size. Phones get the desktop layout,
squeezed by Tailwind breakpoints, plus the hamburger drawer from Phase 10.5. The user has
approved a separate mobile design: the "AutomationDM Mobile" artifact, dated 2026-09-25. It has:

- a frosted-glass bottom tab bar: Listing, Dashboard, a centre **+** button that opens the posts
  view, Status, and Settings;
- a large page title that collapses into a small pinned header on scroll, on every page. On the
  Listing page the search bar becomes a search icon in that header;
- Light / Dark / System theme and **Sign out**, both inside Settings.

That design is a different information architecture, not a restyle. It has a new Dashboard and
Settings page, different navigation, and different components. Hiding one tree per breakpoint with
`hidden md:block` would render and ship both trees on every request. It would also keep every file
full of breakpoint conditionals.

## Decision

1. **Two view trees, one data layer.** Presentation lives in `apps/web/src/views/`:
   - `views/desktop/`: the current UI, moved as is (shell, dashboard, posts, post detail, status,
     admin, and their modals and browsers). This move changes no behaviour.
   - `views/mobile/`: the new UI from the approved artifact.
   - `views/shared/`: pieces both trees really use (loader, toast, toggle, icons, theme script,
     session-expiry watcher).

   `src/views` sits outside `src/app` on purpose. Nothing in it can become a route.

2. **Routes stay thin.** Each `src/app/**/page.tsx` owns its params, searchParams,
   auth-dependent redirects (which must run before anything streams) and metadata. It then
   renders `<DesktopX>` or `<MobileX>` with the same props. A view may be an async server
   component that streams its own Suspense sections from the shared data layer. That keeps the
   per-section streaming from Phase 10.4 intact. A fetch moves into the shared data layer once a
   second view needs it, so each fetch has one definition. Server
   actions (`actions.ts`, `automation-actions.ts`), `dashboard-data.ts` and `src/lib/*` are
   shared and stay where they are. **No API, database or Zernio change.**

3. **Device selection is server-side.** A new `src/lib/device.ts` helper:
   - calls `userAgent({ headers: await headers() })` from `next/server` (documented in Next 16);
   - maps `device.type === 'mobile'` to the mobile view, and everything else, including tablets,
     to desktop;
   - lets a `view=mobile|desktop` cookie override the result. Settings gets a "Use desktop site"
     switch, and desktop gets a way back.

   The root layout uses the same helper to choose `DesktopShell` (sidebar) or `MobileShell` (glass
   tab bar). Pages already call `auth()` per request, so reading headers adds no new dynamic
   rendering.

4. **New routes the mobile tabs need:**
   - `/dashboard`: mobile renders the stats and charts. Desktop redirects to `/`, which already
     shows its dashboard.
   - `/settings`: mobile renders the settings page. Desktop redirects to `/` until a desktop
     settings page exists.
   - The **+** button goes to `/instagram/posts?accountId=<first connected account>`. Existing
     routes are reused for the posts list, post detail and status.

5. **Styling.**
   - The mobile tokens (glass, segment, secondary accent) are added to `globals.css` next to the
     existing ones. Light and dark use the same values as the artifact, which already reused the
     web app's palette.
   - The Plus Jakarta Sans font is loaded with `next/font/google` and applied to the mobile shell
     only.

## Consequences

- Each screen now has two presentations to maintain. That cost is accepted: roughly 3-4 users
  work on the tool mostly from phones, and a shared tree has already cost three rounds of
  mobile-specific fixes (10.5, 16.3, and the artifact review).
- `mobile-nav.tsx` (the drawer) stays in `views/desktop` for narrow desktop windows. Phones no
  longer see it.
- **Data gaps the design shows but the backend cannot supply yet:**
  - The dashboard's per-day DM bar and line charts and the Status page's recent-activity feed
    need event history. That only exists once Phase 11 (webhook recording) and Phase 12
    (run/status records) land.
  - The Status page's uptime bar needs health-check history, which is not recorded anywhere.

  Until then, mobile shows only charts derived from data that exists today:
  - active vs. paused (ring chart);
  - top automations by `stats.dmsSent` (bars);
  - button CTR;
  - current service and connection health.

  In place of the time-series charts, the Dashboard shows a short "Daily activity" note explaining
  that they arrive with Phase 11. They are not built ahead of any data to drive them, and no
  numbers are invented.
- The Administration page and the sign-in and sign-up pages stay single-tree, as they already
  are, until someone asks for mobile versions.
- Rollback is cheap: have `device.ts` always return `'desktop'`.
