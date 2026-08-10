# Testing Strategy

Status: Phase 8. Real test suites are added alongside each phase's implementation, not
written speculatively ahead of the code they test.

## Tooling

- Unit/integration: Vitest (preferred for speed/ESM-native fit with a Next.js + NestJS
  TypeScript monorepo; switch to Jest only if a specific NestJS testing integration proves
  meaningfully smoother — not decided against Vitest yet, just not locked in stone).
- API integration: Supertest against a running NestJS instance.
- E2E: Playwright.
- All test commands run through the project-local Node runtime via `scripts/test.ps1` (see
  `docs/DEVELOPMENT-SETUP.md`) — never assume a global `npx` resolves the right versions.

## What gets tested at each level

**Unit** (`packages/automation-engine` if it ends up holding real logic — see
`docs/AUTOMATION-ENGINE.md`'s open question, `packages/zernio`, `packages/validation`,
NestJS services in isolation):
- Keyword matching (contains/word/exact, case sensitivity, empty-keyword = match-any) — only
  if matching turns out to be our own responsibility rather than Zernio's.
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

**E2E** (Playwright, against a fully running local stack):
1. Sign in.
2. Create organization.
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
a real `@nestjs/testing` app instance and the real local Postgres (`scripts/db.ps1 start`,
same disposable dev database `packages/database`'s tests use). Bootstraps two real users,
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

## CI

GitHub Actions runs lint + typecheck + unit + integration tests on every PR (Phase 1 sets up
the workflow skeleton; it starts minimal and grows as apps/api and apps/web gain real code —
an empty CI workflow that always passes is worse than no CI, so it's introduced once there's
something real to check).
