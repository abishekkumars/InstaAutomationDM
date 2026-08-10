# Testing Strategy

Status: Phase 0 baseline. Real test suites are added alongside each phase's implementation,
not written speculatively ahead of the code they test.

## Tooling

- Unit/integration: Vitest (preferred for speed/ESM-native fit with a Next.js + NestJS
  TypeScript monorepo; switch to Jest only if a specific NestJS testing integration proves
  meaningfully smoother — not decided against Vitest yet, just not locked in stone).
- API integration: Supertest against a running NestJS instance.
- E2E: Playwright.
- All test commands run through the project-local Node runtime via `scripts/test.ps1` (see
  `docs/DEVELOPMENT-SETUP.md`) — never assume a global `npx` resolves the right versions.

## What gets tested at each level

**Unit** (`packages/automation-engine`, `packages/zernio`, `packages/validation`, NestJS
services in isolation):
- Keyword matching (contains/word/exact, case sensitivity, empty-keyword = match-any).
- Condition evaluation and short-circuiting.
- Full trigger→conditions→actions execution against fake evaluators/executors.
- Tenant authorization at the service layer (org A cannot fetch org B's rows — see below).
- Webhook idempotency logic (duplicate event id → no-op).
- Rate limiting logic.
- `ZernioInstagramProvider` adapter behavior against a mocked HTTP layer (never real Zernio).

**Integration** (real Postgres + Redis in a test/dev instance, real NestJS app):
- Database: Prisma queries against a real (test) database, including the tenant-isolation
  constraint queries.
- Redis/BullMQ: job enqueue → job processed by a worker under test.
- Webhook ingestion: POST to `/webhooks/zernio` with a valid signature → row in
  `webhook_events` → job enqueued; duplicate POST → still one row.
- Automation execution: a queued webhook-processing job results in the expected
  `automation_runs`/`automation_run_steps` rows, using a mocked Zernio provider.

**E2E** (Playwright, against a fully running local stack):
1. Sign in.
2. Create organization.
3. Connect an Instagram account through a mocked/test Zernio integration.
4. Create a comment automation.
5. Simulate an inbound webhook (via the app's own webhook endpoint with a test-signed
   payload, or Zernio's sandbox `POST /v1/webhooks/test` once that's wired up).
6. Verify the automation run appears with the expected steps.
7. Verify a DM-send job was enqueued/executed against the mock provider.
8. Verify a contact was created.
9. Verify the analytics counter incremented.

## Tenant isolation tests (explicit, not incidental)

For every tenant-owned resource (automations, contacts, conversations, Instagram accounts,
analytics, billing, webhook data), a test proves: authenticated as a member of Org A,
requesting/mutating a resource that belongs to Org B returns a not-found/forbidden result,
never the data. These tests live alongside the module they cover and are run on every PR,
not just written once and forgotten.

## Mocking external calls

No automated test ever calls production Zernio. `packages/zernio` is designed so its HTTP
client is injectable/mockable; unit and integration tests always inject a fake. Manual
verification against Zernio's own sandbox (`POST /v1/webhooks/test`, test-mode accounts if
Zernio offers them) is a separate, manual step before shipping a phase — not part of the
automated suite.

## CI

GitHub Actions runs lint + typecheck + unit + integration tests on every PR (Phase 1 sets up
the workflow skeleton; it starts minimal and grows as apps/api and apps/web gain real code —
an empty CI workflow that always passes is worse than no CI, so it's introduced once there's
something real to check).
