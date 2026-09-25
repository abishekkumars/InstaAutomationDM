# tests/e2e

Playwright browser tests for the device-specific views (Phase 18.6,
[ADR 0010](../../docs/ADR/0010-device-specific-views.md)). They run against the **already
running** local dev stack. Full notes: [docs/TESTING.md](../../docs/TESTING.md), "Browser tests".

```powershell
.\scripts\dev.ps1                       # the stack must be up first
.\scripts\e2e.ps1                       # all projects
.\scripts\e2e.ps1 --project=mobile      # just the phone suite
.\scripts\e2e.ps1 --headed              # watch it run
```

- `playwright.config.ts`: a `mobile` project (Pixel 7 user agent, so the server renders the
  mobile view) and a `desktop` project, both on the installed Microsoft Edge. There is no
  browser download.
- `global-setup.ts`: checks the app is reachable, then seeds this suite's own local-only user
  and "E2E (test data)" organization (see `fixtures.ts`). It never touches other data, and
  refuses non-localhost databases.
- `specs/mobile.spec.ts`: covers the tab bar (with Status reached from Settings), the Templates
  tab (create, clone, set default, delete), listing filters and search, the collapsed-header
  focus regression, the enable switch rolling back on a failed save, the theme picker, and
  sign-out.
- `specs/desktop.spec.ts`: checks the sidebar shell, that the mobile-only routes redirect, and the
  Templates page (create, edit, clone, set default, delete).
- Template tests start from no templates: `global-setup.ts` clears them before any page loads, and
  each template test deletes its last template through the UI. Never delete templates directly
  mid-run: the web app caches the list, and a direct database write does not invalidate it.
