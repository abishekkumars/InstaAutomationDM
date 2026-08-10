# Zernio Integration

Status: Phase 0 research pass, based on the current public docs at https://docs.zernio.com/
(retrieved 2026-08-10). This is **not** invented — every claim below traces to that source.
It must be re-verified against the live docs immediately before Phase 5/9/10 implementation,
since third-party API docs change.

Zernio is a unified social-media API (16 platforms). We only use its Instagram surface:
account connection, comment automations (comment-to-DM), and the unified inbox/messages
API, via webhooks + REST.

## Abstraction boundary

Nothing outside `packages/zernio` calls Zernio directly.

```
apps/api, apps/worker
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

`InstagramProvider` exposes domain-shaped methods (`connectAccount`, `createCommentAutomation`,
`sendDirectMessage`, `sendPublicReply`, ...) — never raw Zernio request/response shapes. This
means if Zernio's API changes, or we ever add a second provider, only
`ZernioInstagramProvider` changes.

## Authentication

- API key, prefix `sk_`, passed as `Authorization: Bearer <key>`.
- SDKs read it from a `ZERNIO_API_KEY` environment variable by default — we follow that
  convention. **Never sent to the browser; only used server-side inside `packages/zernio`.**
- Base URL: `https://zernio.com/api/v1`.

## Account connection

Two OAuth paths for Instagram:
- Direct Instagram Login — `instagram_business_*` scopes.
- Facebook Login — `instagram_*` scopes + Facebook Page management.

Constraint: only Business or Creator Instagram accounts can be connected; **personal
accounts cannot post/DM via the API.** The account-connection UI (Phase 9) must communicate
this to the user before they attempt to connect a personal account.

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
  to be documented in Phase 13 when we actually integrate it, rather than transcribed twice.

This maps directly onto our own `automations` + `automation_triggers` +
`automation_conditions` + `automation_actions` tables (`docs/DATABASE.md`) — we do not need
to invent our own trigger/condition vocabulary beyond what Zernio can execute, though our
schema is intentionally a little more general (see `docs/AUTOMATION-ENGINE.md`) so future
triggers (e.g. plain DM keyword) fit without a redesign.

## Direct messages

- Text DMs, attachments (image/video/audio/PDF).
- Quick replies: up to 13.
- Generic template buttons: up to 3 — this is our "DM button/link" feature (section 1 item 9
  of the product vision).
- Carousels: up to 10 elements.
- Emoji reactions to messages.
- `HUMAN_AGENT` message tag bypasses Meta's 24-hour standard messaging window — relevant for
  follow-up workflows (Phase 19) that fire outside 24h of the last contact message.

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
  Phase 10 integration testing against Zernio's sandbox rather than only mocks.

## Known limitations that shape our product scope

Confirmed directly from `docs.zernio.com/platforms/instagram`:

- **Cannot create top-level comments** — only reply to existing ones. Irrelevant to our
  use case (we only ever reply to an incoming comment).
- **Story replies are not available via the API** — this is a Meta Graph API limitation,
  not a Zernio gap. The `trigger: "story_reply"` field exists on the comment-automations
  endpoint per the docs snippet we saw, but the platform page explicitly says story replies
  are unavailable for Instagram — this contradiction must be resolved by hands-on testing in
  Zernio's sandbox during Phase 9/13, not assumed either way. Documented as an open question,
  not silently resolved.
- No Reels music/filters/stickers/live via API — not relevant to this product.
- DM history access requires prior consent; follow-relationship visibility is limited to
  users who have previously messaged the account — relevant to `contacts`/`conversations`
  design (Phase 15/18): we cannot backfill a full DM history on first connect.

## Rate limits

Not specified in the pages retrieved during this Phase 0 pass. Must be checked against
`docs.zernio.com` (and/or the response headers of real calls) before Phase 12 implements
retry/backoff for the Zernio adapter — do not hardcode an assumed limit.

## What's deliberately deferred

Full request/response schemas for every endpoint we'll use (inbox/messages list, account
list, webhook test endpoint) are documented endpoint-by-endpoint as each is actually
integrated (Phase 9/10/13/18), rather than transcribed wholesale now against a doc site
that may change before we get there.
