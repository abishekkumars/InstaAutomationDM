# Testing Strategy

Status: Phase 16. Real test suites are added alongside each phase's implementation, not
written speculatively ahead of the code they test.

**Where coverage actually is, as of Phase 18.6.** Worth stating plainly, because the plan below
describes more than exists:

| Package | Runner | Suites |
|---|---|---|
| `apps/api` | Vitest + Supertest | **118 tests** across 6 e2e suites (auth/session guard, admin, organizations, instagram, automations, meta connection) |
| `packages/database` | Vitest | 16 (schema constraints against real Postgres) |
| `packages/validation` | Vitest (added Phase 15.2a) | 16 (`slugFromEmail` and the organization schema) |
| `packages/shared` | Vitest (added Phase 15.1) | 22 (`ADMIN_EMAIL` bootstrap rules, active-organization choice, and more) |
| `packages/meta` | Vitest (added Phase 17) | 17 (Graph client and OAuth) |
| `tests/e2e` | **Playwright** (added Phase 18.6) | **8 browser tests** against the running stack: 6 on a phone (Pixel 7 user agent), 2 on desktop. See "Browser tests" below |
| `apps/web` | none of its own | covered only by `tests/e2e` |

`apps/web` still has no unit tests. Since Phase 18.6 its device-specific views (ADR 0010) are
exercised end to end by `tests/e2e`: the tab bar, the listing (filters, search, the
collapsed-header focus regression, the enable switch rolling back), the theme picker, sign-out,
and the desktop/mobile view choice. The rest of the web app - forms, server actions, the
Administration screen, the create/edit wizards - is still verified only by TypeScript, a
production build, and manual browser checks recorded in the phase reports.

## Tooling

- Unit/integration: Vitest (preferred for speed/ESM-native fit with a Next.js + NestJS
  TypeScript monorepo; switch to Jest only if a specific NestJS testing integration proves
  meaningfully smoother — not decided against Vitest yet, just not locked in stone).
- API integration: Supertest against a running NestJS instance.
- E2E: Playwright.
- All test commands run through the project-local Node runtime via `scripts/test.ps1` (see
  `docs/DEVELOPMENT-SETUP.md`) — never assume a global `npx` resolves the right versions.

## The test database (never the development one)

The `packages/database` and `apps/api` suites delete every user, organization, membership,
Instagram account and automation in `beforeEach`. They therefore run against a **separate
database**, chosen by `packages/database/dev/test-database.mjs`:

1. `TEST_DATABASE_URL`, if set.
2. Otherwise, when `DATABASE_URL` points at localhost, the same server with `_test` appended to
   the database name: `automationdm` becomes `automationdm_test`.
3. Otherwise (a remote `DATABASE_URL`, e.g. Supabase) there is no default. The tests fail with a
   message rather than guess a database on someone else's server.

Whichever is chosen, the database name **must end in `_test`**, or both vitest setup files
refuse to start. That guard holds however the tests are launched: `scripts/test.ps1`, `pnpm
--filter ... run test`, or an editor's test runner. `scripts/test.ps1` first runs `pnpm
--filter @automationdm/database run test:prepare`, which creates the test database if it is
missing (through `prisma db execute`, since the embedded Postgres ships without `createdb`) and
applies every migration with `prisma migrate deploy`. CI names its service database
`automationdm_test` for the same reason.

This exists because running the full suite against the development database wiped the
developer's local data twice (Phase 17, and again during Phase 18.1), including a connected
Instagram account.

## What gets tested at each level

**Unit** (`packages/automation-engine` if it ends up holding real logic — see
`docs/AUTOMATION-ENGINE.md`'s open question, `packages/zernio`, `packages/validation`,
NestJS services in isolation):
- ~~Keyword matching (contains/word/exact, case sensitivity, empty-keyword = match-any)~~ —
  **resolved: not our responsibility.** Zernio does the matching server-side, so there is no
  local matching logic to unit-test and `packages/automation-engine` was never built (see
  `docs/AUTOMATION-ENGINE.md`). Note that "empty keywords = match any" is nonetheless real —
  it is Zernio's rule, and this project sends `[]` to invoke it (Phase 16.2); what is tested is
  that the empty array *reaches* Zernio, not that we match on it.
- Tenant authorization at the service layer (org A cannot fetch org B's rows — see below).
- Webhook idempotency logic (duplicate event id → no-op).
- `ZernioInstagramProvider` adapter behavior against a mocked HTTP layer (never real Zernio).

**Integration** (real Postgres in a test/dev instance, real NestJS app):
- Database: Prisma queries against a real (test) database, including the tenant-isolation
  constraint queries.
- Webhook ingestion: POST to `/webhooks/zernio` with a valid signature → row in
  `webhook_events` → automation executed in-process (no queue, per
  `docs/ADR/0005-simplified-mvp-architecture.md`); duplicate POST → still one row, no
  duplicate send.
- Automation execution: a webhook for a tracked post/reel + matching keyword results in the
  expected `automation_runs` row, using a mocked Zernio provider.

**E2E** (Playwright, against a fully running local stack): **a first slice exists** (Phase 18.6, see
"Browser tests" below). The full flow here is still a plan. Note
that step 2 no longer describes the product: organizations are created by an administrator, not
by the signing-up user (Phase 15.3).
1. Sign in.
2. ~~Create organization.~~ Sign in as an administrator and assign the new user an organization
   through the Administration screen — a user with no membership can go no further, which is
   itself worth asserting.
3. Connect an Instagram account through a mocked/test Zernio integration.
4. List posts/reels, click one.
5. Create a comment automation for it (keyword, public reply, DM).
6. Simulate an inbound webhook (via the app's own webhook endpoint with a test-signed
   payload, or Zernio's sandbox `POST /v1/webhooks/test` once that's wired up).
7. Verify the automation's basic status/history reflects the trigger.
8. Verify the mock provider recorded the expected public reply + DM.

## Tenant isolation tests (explicit, not incidental)

For every tenant-owned resource (Instagram accounts, automations, webhook data), a test
proves: authenticated as a member of Org A, requesting/mutating a resource that belongs to
Org B returns a not-found/forbidden result, never the data. These tests live alongside the
module they cover and are run on every PR, not just written once and forgotten.

**First real example (Phase 6)**:
`apps/api/src/organizations/__tests__/organizations.e2e.test.ts` — Vitest + Supertest against
a real `@nestjs/testing` app instance and the real local Postgres server (`scripts/db.ps1 start`,
using the same disposable `automationdm_test` database as `packages/database`'s tests - see "The test
database" above). Bootstraps two real users,
has one create an organization, then asserts the other gets a plain `404` (not the data, not
a `403` that would confirm the org's existence) when requesting its member list. This is the
template for every future tenant-isolation test — real HTTP requests through the real guard
and service layer, not a unit test mocking the authorization check away.

`apps/api`'s Vitest config needs `unplugin-swc` (`docs/DEVELOPMENT-SETUP.md` has the why —
NestJS's DI relies on `emitDecoratorMetadata`, which Vitest's default esbuild transform
doesn't produce).

## Mocking external calls

No automated test ever calls production Zernio. `packages/zernio` is designed so its HTTP
client is injectable/mockable; unit and integration tests always inject a fake. Manual
verification against Zernio's own sandbox (`POST /v1/webhooks/test`, test-mode accounts if
Zernio offers them) is a separate, manual step before shipping a phase — not part of the
automated suite.

**First real example (Phase 8)**: `apps/api/src/instagram/__tests__/instagram.e2e.test.ts`
binds a NestJS testing module's `INSTAGRAM_PROVIDER` token to an in-memory
`FakeInstagramProvider` (`.overrideProvider(INSTAGRAM_PROVIDER).useValue(fakeProvider)`)
instead of the real `ZernioInstagramProvider` — lets tests deterministically control what
"Zernio" reports back for `findConnectedAccount`, including deliberately wrong answers (to
prove the callback handler doesn't just trust the redirect's own query params), with zero
real network calls or real credentials needed to run the suite.

## Browser tests (Playwright, Phase 18.6)

`tests/e2e` is its own workspace package (`@automationdm/e2e`). Run it with:

```powershell
.\scripts\dev.ps1      # in one terminal: the stack must already be running
.\scripts\e2e.ps1      # all projects;  -- --project=mobile  or  --headed  also work
```

- **No browser download.** The `mobile` (Pixel 7) and `desktop` projects drive the Microsoft
  Edge that ships with Windows (`channel: 'msedge'`; set `E2E_BROWSER_CHANNEL=chrome` to use
  Chrome). Nothing is installed outside the repo.
- **Its own data, in the dev database.** The tests have to use the database the running servers
  read, so they cannot use `automationdm_test`. `global-setup.ts` upserts one local-only user
  (`e2e@automationdm.local`, override with `E2E_EMAIL`/`E2E_PASSWORD`) and an
  "E2E (test data)" organization with 12 automations, replacing only that organization's rows.
  Nothing else is read or written, and it refuses to run against a non-localhost database.
- **No Zernio calls.** The organization has no Zernio profile, so listing never calls Zernio.
  The enable-switch test aborts the save request in the browser rather than letting the API
  try to update an automation Zernio has never heard of.
- **Not in CI yet.** It needs the web app, the API and a seeded database running together.
  `scripts/test.ps1` does not run it either (the package deliberately has no `test` script).
- The Next.js dev badge is disabled (`devIndicators: false` in `apps/web/next.config.mjs`). On
  the phone layout it covered the Listing tab and swallowed taps, which the first run caught.

## Demo data for UI testing

To look at the UI with a realistic number of automations without touching a real Instagram
account, seed the local-only demo organization:

```powershell
.\scripts\pnpm.ps1 --filter @automationdm/database run seed:demo -- --email you@example.com
.\scripts\pnpm.ps1 --filter @automationdm/database run seed:demo -- --remove
```

It creates "Demo (test data)" with a fake `@demo.studio` account and 18 automations (14 active),
adds the given user as owner, and refuses to run against anything but a localhost, non-`_test`
database. Switch to it with the organization switcher. The organization has no Zernio profile, so
apps/api never calls Zernio for it: the listing, search, filters, counts and dashboard health read
the seeded rows, while DM/click stats show "—". Anything that must call Zernio (posts grid, post
detail, enable/pause, edit) fails for it, which is also a quick way to see the error states.

## CI

GitHub Actions runs lint + typecheck + unit + integration tests on every PR (Phase 1 sets up
the workflow skeleton; it starts minimal and grows as apps/api and apps/web gain real code —
an empty CI workflow that always passes is worse than no CI, so it's introduced once there's
something real to check).
