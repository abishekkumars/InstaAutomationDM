# Zernio Integration

Status: Phase 8 — account connection is real, verified directly against Zernio's live
OpenAPI spec (`docs.zernio.com/api/openapi`, retrieved 2026-08-11) and its `/guides/
connecting-accounts` and `/multi-tenant` guides, not assumed from the Phase 0 research pass.
Everything else below (posts listing, comment automations, webhooks) is still the Phase 0
pass and **must** be re-verified against the live docs immediately before the phase that
implements it (Phase 9/10/11 — see `docs/IMPLEMENTATION-ROADMAP.md`), since third-party API
docs change.

Zernio is a unified social-media API (16 platforms). We only use its Instagram surface:
account connection, comment automations (comment-to-DM), and the unified inbox/messages
API, via webhooks + REST.

## Abstraction boundary

Nothing outside `packages/zernio` calls Zernio directly.

```
apps/api
    │
    ▼
InstagramProvider (interface, packages/zernio)
    │
    ▼
ZernioInstagramProvider (implementation, packages/zernio)
    │
    ▼
Zernio API (https://zernio.com/api/v1)
    │
    ▼
Meta Graph API / Instagram
```

`InstagramProvider` exposes domain-shaped methods — never raw Zernio request/response
shapes. This means if Zernio's API changes, or we ever add a second provider, only
`ZernioInstagramProvider` changes.

**Status (Phase 8)**: `ensureProfile`, `getConnectUrl`, and `findConnectedAccount` are real —
every call in this section has been made against the live API during this phase's
implementation and verification. Methods for posts listing (Phase 9) and comment automations
(Phase 10) are added when those phases need them, not speculatively now.

## Authentication

- API key, prefix `sk_`, passed as `Authorization: Bearer <key>`.
- SDKs read it from a `ZERNIO_API_KEY` environment variable by default — we follow that
  convention. **Never sent to the browser; only used server-side inside `packages/zernio`.**
- Base URL: `https://zernio.com/api/v1`.

## Zernio profiles - the tenant boundary

Zernio's own multi-tenancy model (`/multi-tenant` guide): "if you're building social
features into your own product, your customers each bring their own social accounts.
Zernio's tenant boundary for this is the **profile**: one profile per customer." This maps
directly onto one Zernio profile per our own `Organization` — `Organization.zernioProfileId`
(`docs/DATABASE.md`) stores it, created lazily via `POST /v1/profiles` (`{ name }` →
`{ profile: { _id } }`) on that organization's first Instagram-connect attempt, never at
organization-creation time. `InstagramProvider.ensureProfile` uses the organization's own
`slug` as the profile name (already globally unique in our system) to avoid Zernio's
per-workspace unique-name collisions; a genuine 409 on create is recovered via the error
body's `details.existingProfileId` rather than left as a hard failure.

## Account connection

Verified directly against the `GET /v1/connect/{platform}` operation in Zernio's live
OpenAPI spec, not the Phase 0 pass's general "two OAuth paths" description:

- `GET /v1/connect/instagram?profileId=<ours>&redirect_url=<ours>` (no `headless`, no
  `loginMethod` override - the default `instagram_login` flow, which has **no secondary
  selection step**: the user authorizes their Instagram professional account directly, no
  Facebook Page required). Response: `{ authUrl, state }` — `InstagramProvider.getConnectUrl`
  returns just `authUrl`; `state` is "handled automatically" by Zernio and not something we
  need to independently verify (see below).
- Redirect the browser to `authUrl`. Zernio hosts the entire OAuth round trip with
  Instagram/Meta itself — we never see an authorization code to exchange.
- Once the user grants access, Zernio redirects the browser to our `redirect_url` with
  `connected=instagram&profileId=<ours>&accountId=<theirs>&username=<theirs>` appended (an
  existing query string on `redirect_url` is preserved, which is how
  `apps/api/src/instagram/instagram.service.ts`'s `createConnectUrl` smuggles our own
  `organizationId` through the round trip alongside Zernio's own `profileId`).
- **We do not trust that redirect's query params on their own** — `apps/api`'s callback
  handler independently re-confirms the connection with a live `GET /v1/accounts?
  profileId=<ours>&platform=instagram` call (`InstagramProvider.findConnectedAccount`)
  before writing anything to our database. This is standard defense-in-depth for a value
  that arrived via the end user's own browser, not a Zernio requirement.
- The `loginMethod=facebook_login` variant (Facebook Login, Facebook Page selection,
  `/v1/connect/instagram/select-account`) exists in the spec but is **not implemented** —
  the default `instagram_login` flow covers this project's MVP scope without a secondary
  selection step, and adding the Facebook-Login path is deferred until a concrete
  requirement appears (this project's 3-4 users connecting their own Instagram Business/
  Creator accounts directly, per `docs/PRODUCT-REQUIREMENTS.md`).
- Constraint (unchanged from the Phase 0 pass, still applies): only Business or Creator
  Instagram accounts can be connected; **personal accounts cannot post/DM via the API.**
  `apps/web`'s connect UI does not yet surface this to the user before they attempt to
  connect a personal account — noted as a known limitation in
  `docs/IMPLEMENTATION-ROADMAP.md`'s Phase 8 report, not silently dropped.

## Comment-to-DM automation API

- `POST /v1/comment-automations` — create.
  - Required: `profileId`, `accountId`, `name`, `dmMessage` (≤640 chars if buttons are
    attached, ~1000 otherwise).
  - Key optional fields: `trigger` (`comment` default | `story_reply` — see limitation
    below), `platformPostId` (scope to one post, omit for account-wide), `keywords`,
    `matchMode` (`contains` default | `word` | `exact`), `buttons` (1-3), `commentReply`
    (the public reply text), `alsoMatchInDms`, `dmDelaySeconds`, `linkTracking`, `clickTag`,
    `audience` (send/skip/verify based on follower status).
  - Response: `automation` object with `id`, config echo, `stats`
    (`totalTriggered`/`totalSent`/`totalFailed`), `createdAt`.
- `GET`-list endpoint also exists (list comment automations) — full request/response shape
  to be documented in Phase 10 when we actually integrate it, rather than transcribed twice.

This maps directly onto our own, deliberately simple `automations` table
(`docs/DATABASE.md`) — one org + one account + one post/reel + keyword(s) + reply template +
DM template. Whether we actually need to re-implement keyword matching ourselves, or whether
registering one of these with Zernio via this endpoint means Zernio executes the whole
match → reply → DM flow itself, is an open question resolved during Phase 10/11
implementation — see `docs/AUTOMATION-ENGINE.md`'s "Open question" section. Do not assume
either way before reading this endpoint's real, current behavior directly.

## Listing posts/reels (needed for MVP items 4-5, not yet researched)

The pages reviewed during this Phase 0 pass covered account connection, comment-automations,
messages, and webhooks — **not** an endpoint for listing an account's existing posts/reels,
which `docs/PRODUCT-REQUIREMENTS.md`'s MVP now requires (list + click into a specific post/
reel to attach an automation to it). Before Phase 9 implements this:

- Find Zernio's actual media/posts listing endpoint for Instagram in the current
  `docs.zernio.com` docs (not assumed here).
- Determine its real pagination mechanism. If it's cursor-based (common for this kind of
  API), **preserve cursor-based pagination end to end** in `apps/api`'s own endpoint and
  `apps/web`'s UI — do not flatten it into a fake offset/page-number scheme on our side.

## Direct messages

- Text DMs, attachments (image/video/audio/PDF).
- Quick replies: up to 13.
- Generic template buttons: up to 3 — this is our "DM button/link" feature (section 1 item 9
  of the product vision).
- Carousels: up to 10 elements.
- Emoji reactions to messages.
- `HUMAN_AGENT` message tag bypasses Meta's 24-hour standard messaging window. Not currently
  relevant — this project has no follow-up/delayed-workflow feature (retired per
  `docs/ADR/0005-simplified-mvp-architecture.md`) — noted only in case that scope returns.

## Webhooks

- Real-time events: `message.received`, `message.sent`, `message.edited`, `message.deleted`,
  `message.read`, plus comment-related events for incoming comments.
- Signature: optional `X-Zernio-Signature` header, HMAC-SHA256 over the raw request body
  using a webhook secret (`ZERNIO_WEBHOOK_SECRET`). **We treat this as mandatory, not
  optional** — reject any webhook request without a valid signature once
  `ZERNIO_WEBHOOK_SECRET` is configured. Verify with a timing-safe comparison.
- Delivery is at-least-once. Zernio itself recommends deduping on event id — this is exactly
  the `webhook_events` unique-constraint idempotency strategy in `docs/DATABASE.md` /
  `docs/WEBHOOKS.md`.
- Debugging: `GET /v1/webhooks/logs` (30-day retention), `POST /v1/webhooks/test`. Useful for
  Phase 11 integration testing against Zernio's sandbox rather than only mocks.

## Known limitations that shape our product scope

Confirmed directly from `docs.zernio.com/platforms/instagram`:

- **Cannot create top-level comments** — only reply to existing ones. Irrelevant to our
  use case (we only ever reply to an incoming comment).
- **Story replies are not available via the API** — this is a Meta Graph API limitation,
  not a Zernio gap. The `trigger: "story_reply"` field exists on the comment-automations
  endpoint per the docs snippet we saw, but the platform page explicitly says story replies
  are unavailable for Instagram — this contradiction must be resolved by hands-on testing in
  Zernio's sandbox during Phase 10/11, not assumed either way. Documented as an open
  question, not silently resolved. Moot for the MVP either way — the current scope is
  comment triggers only, not story replies.
- No Reels music/filters/stickers/live via API — not relevant to this product.
- DM history access requires prior consent; follow-relationship visibility is limited to
  users who have previously messaged the account. Not currently relevant — this project has
  no contacts/inbox feature (retired per `docs/ADR/0005-simplified-mvp-architecture.md`) —
  noted only in case that scope is ever revisited.

## Rate limits

Not specified in the pages retrieved during this Phase 0 pass. Must be checked against
`docs.zernio.com` (and/or the response headers of real calls) before any phase implements
retry/backoff for the Zernio adapter — do not hardcode an assumed limit. Low priority at
this project's actual call volume (<1,000/month).

## What's deliberately deferred

Account connection is documented for real as of Phase 8 (above). Full request/response
schemas for the remaining endpoints we'll use (posts/media list, comment-automations,
webhook test endpoint) are documented endpoint-by-endpoint as each is actually integrated
(Phase 9-11), rather than transcribed wholesale now against a doc site that may change
before we get there.
