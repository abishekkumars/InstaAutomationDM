# Zernio Integration

Status: Phase 10.2b — account connection (Phase 8), listing posts/reels (Phase 9), and comment
automations (Phase 10) are all real, verified directly against Zernio's live OpenAPI spec
(`docs.zernio.com/api/openapi`, re-fetched fresh for each phase), not assumed from the Phase
0 research pass. Everything else below (webhooks) is still the Phase 0 pass and **must** be
re-verified against the live docs immediately before the phase that implements it (Phase 11
— see `docs/IMPLEMENTATION-ROADMAP.md`), since third-party API docs change.

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

**Status (Phase 10)**: `ensureProfile`, `getConnectUrl`, `findConnectedAccount` (Phase 8),
`listPosts`/`getPost` (Phase 9), and `createCommentAutomation` (Phase 10) are all real —
every call in this section has been made against the live API during the phase that added
it.

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
(`docs/DATABASE.md`) stores it, resolved lazily on that organization's first
Instagram-connect attempt, never at organization-creation time.
`InstagramProvider.ensureProfile` uses the organization's own `slug` as the profile name
(already globally unique in our system) to avoid Zernio's per-workspace unique-name
collisions.

**`ensureProfile` looks before it creates** (verified against the live spec's `listProfiles`
operation): it first calls `GET /v1/profiles?name=<slug>` — an **exact-match** filter Zernio's
own spec documents for precisely this case ("useful to recover a profile id after an ambiguous
create") — and only falls through to `POST /v1/profiles` (`{ name }` → `{ profile: { _id } }`)
when that finds nothing. Response shape is `{ profiles: Profile[] }` (plus `total`/`skip`/
`limit`, present only when `limit`/`skip` was passed); the exact-name match is re-checked
client-side rather than trusting the server to have filtered.

Without that lookup, an organization whose `zernioProfileId` was never persisted locally — a
crash or a failed DB write between Zernio's create succeeding and our own `organization.update`
— would `POST` a brand-new profile on **every** retry, silently accumulating duplicate Zernio
profiles for one organization. The 409-recovery path below is a backstop for the remaining
race, not the primary defense:

- A 409 whose `details.existingProfileId` is present resolves to that id directly.
- A 409 **without** it re-queries by name, because the spec assigns that same status code to a
  second case (a request with the same `Idempotency-Key` still processing), where the field is
  not guaranteed.

**Connecting is skipped when an account is already connected.** `apps/api`'s
`createConnectUrl` calls `findConnectedAccount` before building any OAuth URL. If Zernio already
reports a connected Instagram account for the profile, the account is reconciled into our own
`instagram_accounts` table (upserted on `zernioAccountId`, never a second row) and the endpoint
returns `{ alreadyConnected: true, account }` instead of an `authUrl` — the user is not sent
through an authorize round trip for a connection they already have. A connected account that
belongs to a *different* organization is never adopted this way; that case falls back to the
normal OAuth flow so the callback handler raises its proper `409`.

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

Verified directly against `POST/GET/PATCH/DELETE /v1/comment-automations[/{automationId}]`
in Zernio's live OpenAPI spec during Phase 10 - the Phase 0 pass's field list below was
already close, but the load-bearing fact it missed (whether Zernio or we do the matching)
is now resolved, not assumed.

- **Zernio executes the entire flow server-side.** Its own description: *"Set up keyword
  triggers on Instagram/Facebook so commenters automatically receive a DM."* This resolves
  `docs/AUTOMATION-ENGINE.md`'s "Open question" - our code only ever calls the create
  endpoint with the user's config; Zernio does the keyword matching, the public reply, and
  the DM send itself. `packages/automation-engine` was never built - there is no local
  matching logic anywhere in this project.
- `POST /v1/comment-automations` — create.
  - Required: `profileId`, `accountId`, `name`, `dmMessage` (≤640 chars once `buttons` are
    attached, ~1000 otherwise - enforced by `packages/validation`'s `createAutomationSchema`,
    conditionally, since it depends on the sibling `buttons` field).
  - `keywords` is a **string array**, not a single string (`type: array, items: {type:
    string}`) - `InstagramProvider.createCommentAutomation` and the create form both take
    multiple keywords for exactly this reason, not one.
  - `platformPostId` and `postId` are **two different ids, and must not be swapped** (corrected
    in Phase 10.2b - this was previously wrong in both this doc and the code):
    - `platformPostId` is *"Platform media/post ID"* - **Instagram's own media id**, i.e. the
      id an incoming comment actually carries. This is `InstagramPost.platformPostId`.
    - `postId` is *"Zernio post ID ... required only when also targeting a specific post via
      platformPostId"* - Zernio's own `_id`, i.e. `InstagramPost.zernioPostId`.

    Sending Zernio's `_id` as `platformPostId` (what this project did until Phase 10.2b)
    creates an automation scoped to an id Instagram never reports, so **it can never fire**,
    while still returning a perfectly successful-looking `201`. `apps/api` resolves the real
    media id via `getPost` before creating, and rejects the create if the post has none rather
    than silently falling back to an account-wide automation.

    Setting `platformPostId` scopes the automation to one specific post/reel (omit for
    account-wide - **only one active per-post automation is allowed per post**, enforced by
    Zernio with a `409` on a duplicate, and mirrored locally by `Automation`'s
    `unique(instagramAccountId, zernioPostId)`). This project always sets it - "one specific
    Zernio post/reel" per `docs/AUTOMATION-ENGINE.md`'s model, never account-wide.
  - `matchMode` (`contains` default | `word` | `exact`) - same three values this project's
    `AutomationMatchMode` enum already anticipated.
  - `commentReply` (the public reply text) is **optional**, not required - a DM-only
    automation with no public reply is a normal, supported configuration.
  - `buttons` (Phase 10.1 - real, built): up to 3 inline DM buttons,
    `{type, title (≤20 chars), url}[]`. Zernio's real `DmButton` schema also supports
    `type: postback` (delivered via a `messaging_postbacks` webhook this project doesn't
    handle) and `type: phone` (Facebook-only) - this project only ever sends `type: "url"`,
    the only type relevant to an Instagram-only tool with no postback webhook. `linkTracking`
    (boolean, default **true**) wraps `url` buttons in a tracked redirect so clicks are
    counted - left at its default; this project never sends it explicitly, since the default
    is exactly the behavior wanted (see the `stats` fields below).
  - Not used by this project (documented for completeness, not built): `trigger:
    story_reply`, `template`, `*Variations` rotation, `clickTag`,
    `dmDelaySeconds`/`commentReplyDelaySeconds`, `audience`/`followGate`,
    `excludeKeywords`/`typoTolerance`, `alsoMatchInDms`.
  - Response: `{ automation: { id, name, platform, trigger, platformPostId, keywords,
    matchMode, commentReply, buttons, dmMessage, isActive, stats: {totalTriggered, totalSent,
    totalFailed}, createdAt, ... } }`. **Does not echo `accountId`** (list/get do) -
    `ZernioInstagramProvider` doesn't rely on it being present in the create response, since
    the caller already knows which account it asked to create the automation for.
- `GET /v1/comment-automations?profileId=` — list. Only filters by `profileId` (no
  `accountId`/`platformPostId` filter) - each item includes `accountId` and `platformPostId`
  for the caller to filter further if needed. **Its `stats` object is richer than the
  create/get response's** - verified live during Phase 10.1, a real, load-bearing
  inconsistency in Zernio's own API, not assumed to match: `{triggered, dmsSent, dmsFailed,
  uniqueContacts, trackedSends, linkClicks, uniqueClicks, delivered, read}`, vs. create/get's
  `{totalTriggered, totalSent, totalFailed}`. `linkClicks`/`uniqueClicks` (real click-through
  counts on tracked button links) and `dmsSent` only come from this list endpoint. **Wired up
  in Phase 10.3**: `apps/api`'s `listForOrganization` calls this to put live sent/click counts
  on the dashboard, and `CommentAutomation.stats` is nullable precisely because create/get
  return the other, smaller shape.
  **CTR denominator**: Zernio's own spec is explicit that `trackedSends`, not `dmsSent`, is the
  right divisor for a click-through rate ("divide clicks by this, not dmsSent") - a DM carrying
  no tracked link can never be clicked, so `dmsSent` understates the rate. This project follows
  that, and reports `null` rather than `0` when `trackedSends` is 0.
- `GET /v1/comment-automations/{automationId}` — get one, including recent trigger `logs`
  (per-comment outcome: `status` sent/failed/skipped/gated/pending, `commentText`,
  `commenterId`, errors). Useful for Phase 12's status/history view - not built yet.
- `PATCH`/`DELETE /v1/comment-automations/{automationId}` exist (update settings, permanently
  delete) - not built in Phase 10 ("comment automation **creation**" per the roadmap); a
  future phase adds edit/delete if a real need appears.

**Zernio is the system of record for automations, and `apps/api` reconciles from it** (Phase
10.2b). `AutomationsService.listForPost` reads the local `automations` table first, but when
that finds nothing it calls `GET /v1/comment-automations?profileId=`, filters to the account +
post in question, and backfills the missing local row. Without this, an automation created
directly in Zernio's own dashboard - or by a request whose local insert failed *after* the
Zernio call already succeeded - is invisible in this app forever, which is exactly the bug
Phase 10.2b fixed. The match is made on **either** `postId` or `platformPostId`, because
automations created before the id fix above carry only the (wrong) one. A Zernio failure here
degrades to "no automation" rather than failing the page - this is a read path.

This maps directly onto `Automation` (`docs/DATABASE.md`) - one org + one connected account +
one specific Zernio post/reel + `keywords[]` + match mode + optional public reply + DM
message + active flag, plus Zernio's own `zernioAutomationId` so a future webhook (Phase 11)
can resolve back to this row the same way `InstagramAccount.zernioAccountId` already does.

## Listing posts/reels

Verified directly against `GET /v1/posts` and `GET /v1/posts/{postId}` in Zernio's live
OpenAPI spec during Phase 9 — the Phase 0 pass never found this endpoint at all (it covered
account connection, comment-automations, messages, and webhooks, not media listing).

- `GET /v1/posts` is Zernio's cross-platform **publishing** endpoint, not an
  Instagram-specific one. Its `source` query param picks the collection: `zernio` (default)
  is content authored *through* Zernio's own scheduling/publishing tool (a feature this
  project has none of); `source=external` is existing content that was published on the
  platform itself and Zernio has synced in — this is what "list an account's existing
  posts/reels" (`docs/PRODUCT-REQUIREMENTS.md`'s MVP items 4-5) actually means, and what
  `InstagramProvider.listPosts` always requests. Zernio keeps up to ~12 months of synced
  history per account. Other relevant filters: `accountId`, `platform=instagram`.
- **Pagination is page/limit-based, not cursor-based** (`page` 1-based, `limit` default 10,
  max 500 — values above the max return `400` rather than being silently clamped). The
  Phase 0 pass's placeholder guessed this might be cursor-based and said to preserve
  whichever scheme turned out to be real end to end; it's page/limit, so `apps/api`'s own
  `GET .../instagram/accounts/:accountId/posts` and `apps/web`'s UI use plain
  `page`/`limit` query params, not an invented offset scheme layered on top of something
  different.
- Response shape: `{ posts: Post[], pagination: { page, limit, total, pages } }`. Each `Post`
  carries `content` (caption), `mediaItems` (`type`, `url`, `thumbnail`/`instagramThumbnail`),
  and `platforms` (one entry per platform the post is associated with — for a synced
  Instagram post, one entry with `platform: "instagram"`, `accountId`, `platformPostId` (the
  native Instagram media id), `platformPostUrl` (the public permalink), `publishedAt`).
  `InstagramProvider.listPosts`/`getPost` map this into a small domain type
  (`zernioPostId`, `zernioAccountId`, `platformPostId`, `permalink`, `caption`, `mediaType`,
  `thumbnailUrl`, `publishedAt`) rather than leaking Zernio's own shape.
- **`GET /v1/posts/{postId}` does not work for `source: external` posts** — confirmed live,
  not assumed: it returns `{"error":"Post not found",...}` for a `postId` taken directly from
  a real `listPosts` response, with or without `profileId`/`source` query params added. Every
  synced post this project needs a "detail view" for is `source: external`, so
  `ZernioInstagramProvider.getPost` does **not** call this endpoint at all — it instead calls
  `listPosts` with `limit: 500` (Zernio's own max, comfortably covering the ~12-month synced
  window for this project's account sizes — verified against a real account with 46 total
  synced posts) and searches the result for the matching `_id`. This is a real, load-bearing
  workaround for a genuine gap in Zernio's API, not a stylistic choice.
- A Reel is just a video-`mediaType` post on Instagram's own data model — Zernio exposes no
  separate "is this a reel" flag, so this project doesn't invent one either; the UI labels a
  post by its `mediaType` (`image`/`video`/`gif`/`document`).
- **Tenant-isolation note**: `listPosts`'s `accountId` filter means Zernio itself scopes list
  results to the requested account, but `getPost`'s fallback search only ever runs against
  that same accountId-scoped `listPosts` call (never a global, unscoped lookup), and
  `apps/api`'s `InstagramService.getPost` still independently re-checks the returned post's
  `zernioAccountId` against the account the caller asked about before returning it — the same
  defense-in-depth discipline as the callback handler's live re-confirmation in Phase 8, kept
  as a second check even though the first (accountId-scoped `listPosts`) already prevents it
  structurally.

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
  are unavailable for Instagram — this contradiction is still unresolved (Phase 10 only
  built the default `trigger: comment` path, never touched `story_reply`); resolving it needs
  hands-on testing in Zernio's sandbox, not assumed either way. Documented as an open
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

Account connection (Phase 8), listing posts/reels (Phase 9), and comment automations (Phase
10) are documented for real above. The webhook test endpoint's full request/response shape
is documented when Phase 11 actually integrates it, rather than transcribed wholesale now
against a doc site that may change before we get there.
