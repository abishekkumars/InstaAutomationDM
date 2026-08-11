# API Specification

Status: Phase 10 — `apps/api` has `GET /api/health` (liveness), `GET /api/ready` (readiness,
checks the database), the error/request-id foundation every endpoint sits on, its
`organizations` endpoints (Phase 6), its Zernio-backed `instagram` endpoints
(connect/callback/accounts in Phase 8; posts/reels listing in Phase 9), and comment-automation
creation (Phase 10). Further business endpoints land with the phase that needs them:
automation status/history in Phase 12, webhooks in Phase 11, etc.

## Convention

- All routes are served under the global prefix `/api` (set in `apps/api/src/main.ts` via
  `app.setGlobalPrefix('api')`).
- REST, JSON bodies, resources scoped under the caller's organization implicitly (never a
  client-supplied `organizationId` in the path/body for tenant-owned resources — see
  `docs/DATABASE.md`/`docs/SECURITY.md`).
- Every route except `/api/health`/`/api/ready` requires `Authorization: Bearer <token>` —
  a short-lived internal service token minted by `apps/web`, verified by `SessionGuard`. See
  `docs/ARCHITECTURE.md`'s "Session verification (Phase 6)" section. Missing/invalid token →
  `401` in the standard error shape.
- Versioned under `/api/v1` if/when a breaking change is ever needed; unversioned for the
  MVP since there are no external API consumers yet.
- Errors: every unhandled/thrown exception is caught by
  `apps/api/src/common/filters/all-exceptions.filter.ts` and returned as
  `{ error: { code, message, requestId } }` — `code` is the exception class name for
  `HttpException`s (`NotFoundException`, `BadRequestException`, ...) or
  `InternalServerError` otherwise; `message` is generic ("Internal server error") for
  non-`HttpException`s so internals never leak (see `docs/SECURITY.md`); full detail is
  logged server-side against the same `requestId`.
- Every request gets an `X-Request-Id` response header — either echoed back from an
  inbound `X-Request-Id` header, or generated (`crypto.randomUUID()`) by
  `apps/api/src/common/middleware/request-id.middleware.ts`. This is the correlation id
  used in server logs and in every error response body.
- `GET /api/ready` checks the database (Phase 4). No Redis check is planned — this project
  has no Redis (`docs/ADR/0005-simplified-mvp-architecture.md`).

## Endpoint inventory

### `GET /api/health`

Liveness check. No auth. Always `200` if the process is up.

Response:
```json
{
  "status": "ok",
  "service": "api",
  "timestamp": "2026-08-10T15:31:46.908Z",
  "uptimeSeconds": 13
}
```

### `GET /api/ready`

Readiness check. No auth. `200` if the database is reachable, `503` (standard error shape)
otherwise.

Response (`200`):
```json
{
  "status": "ready",
  "service": "api",
  "timestamp": "2026-08-10T17:27:49.662Z"
}
```

Response (`503`, database unreachable):
```json
{
  "error": {
    "code": "ServiceUnavailableException",
    "message": "Database unreachable",
    "requestId": "bed45b6f-d6ee-4ed6-b1c7-63e088fb8c21"
  }
}
```

### Error shape example

`GET /api/does-not-exist` → `404`:
```json
{
  "error": {
    "code": "NotFoundException",
    "message": "Cannot GET /api/does-not-exist",
    "requestId": "5f1da08d-94a9-4d30-9787-61dad753b047"
  }
}
```

### `POST /api/organizations`

Creates an organization and makes the caller its `OWNER`. Requires a bearer token (see
Convention above).

Request:
```json
{ "name": "Acme Inc", "slug": "acme" }
```
`slug`: lowercase letters, numbers, and hyphens only (validated by
`packages/validation`'s `createOrganizationSchema`, shared with `apps/web`'s
create-organization form).

Response (`201`):
```json
{ "id": "clx...", "name": "Acme Inc", "slug": "acme", "role": "OWNER" }
```

Errors: `400` (invalid name/slug), `409` (slug already taken — standard error shape, e.g.
`{"error":{"code":"ConflictException","message":"An organization with that slug already exists.","requestId":"..."}}`).

### `GET /api/organizations`

Lists the organizations the caller belongs to, each with the caller's role in it. Requires a
bearer token.

Response (`200`):
```json
[{ "id": "clx...", "name": "Acme Inc", "slug": "acme", "role": "OWNER" }]
```

### `GET /api/organizations/:id/members`

Lists the members of organization `:id` — but only if the caller is themselves a member.
Requires a bearer token.

Response (`200`):
```json
[{ "id": "clx...", "role": "OWNER", "user": { "id": "clx...", "email": "alice@example.com", "name": null } }]
```

Response (`404`, `:id` doesn't exist **or** the caller isn't a member of it — intentionally
the same response either way, so a non-member can't distinguish the two and thereby confirm
an organization's existence):
```json
{ "error": { "code": "NotFoundException", "message": "Organization not found.", "requestId": "..." } }
```

### `POST /api/organizations/:organizationId/instagram/connect`

Starts the Instagram OAuth connect flow for this organization (Phase 8). Requires a bearer
token; 404s if the caller isn't a member of `:organizationId` (same tenant-isolation pattern
as `GET /api/organizations/:id/members`). Creates the organization's Zernio profile on first
call (persists `Organization.zernioProfileId`); reuses it on every later call. See
`docs/ZERNIO-INTEGRATION.md`'s "Account connection" section.

Response (`201`):
```json
{ "authUrl": "https://www.facebook.com/v21.0/dialog/oauth?client_id=..." }
```
`apps/web`'s server action redirects the browser to `authUrl` — this is a real redirect to
an external origin, not a route within this app.

Errors: `404` (not a member), `500` (Zernio API error — e.g. an invalid/rejected
`ZERNIO_API_KEY`; see `docs/IMPLEMENTATION-ROADMAP.md`'s Phase 8 report for a known instance
of this).

### `POST /api/organizations/:organizationId/instagram/callback`

Completes the connect flow after Zernio redirects the browser back. Requires a bearer token;
same 404-if-not-a-member check as above. **Never trusts the request body alone** — the
`profileId` must match this organization's `Organization.zernioProfileId`, and the
`accountId` must be independently confirmed via a live `GET /v1/accounts` call to Zernio
before anything is written (see `docs/ARCHITECTURE.md`'s "Instagram connect flow" section).

Request:
```json
{ "profileId": "66a1f0c2a4b9d3e8f1a2b3c4", "accountId": "17841400649984407" }
```

Response (`201`):
```json
{ "id": "clx...", "zernioAccountId": "17841400649984407", "username": "acme_ig", "status": "CONNECTED" }
```

Errors: `400` (`profileId` doesn't match this organization, or Zernio doesn't confirm the
claimed `accountId`), `404` (not a member), `409` (this Zernio account is already connected
to a *different* organization — `InstagramAccount.zernioAccountId` is globally unique, see
`docs/DATABASE.md`).

### `GET /api/organizations/:organizationId/instagram/accounts`

Lists this organization's connected Instagram accounts (Phase 8). Requires a bearer token;
same 404-if-not-a-member check as above.

Response (`200`):
```json
[{ "id": "clx...", "zernioAccountId": "17841400649984407", "username": "acme_ig", "status": "CONNECTED" }]
```

### `GET /api/organizations/:organizationId/instagram/accounts/:accountId/posts`

Lists an account's existing Instagram posts/reels (Phase 9) — proxies Zernio's own
`GET /v1/posts?source=external`, never persisted locally (`docs/ADR/0005`). Requires a
bearer token; 404s if the caller isn't a member of `:organizationId`, or if `:accountId`
doesn't belong to it (same 404-not-403 tenant-isolation pattern as every other resource in
this module).

Query params: `page` (integer, ≥1, default `1`), `limit` (integer, 1-500, default `10` —
matches Zernio's own bounds; a value above 500 is rejected with `400`, not clamped).

Response (`200`):
```json
{
  "posts": [
    {
      "zernioPostId": "6a7988dfd0fe733d1ab80576",
      "platformPostId": "17843210987654321",
      "permalink": "https://www.instagram.com/p/Cxxxxxxxxxx/",
      "caption": "...",
      "mediaType": "video",
      "thumbnailUrl": "https://...",
      "publishedAt": "2026-08-09T15:32:51.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 46, "pages": 5 }
}
```

Errors: `400` (invalid `page`/`limit`), `404` (not a member, or `:accountId` not found under
this organization).

### `GET /api/organizations/:organizationId/instagram/accounts/:accountId/posts/:postId`

Fetches a single post/reel. Requires a bearer token; same 404 checks as the list endpoint
above, plus a `404` if `:postId` doesn't belong to `:accountId` — see
`docs/ZERNIO-INTEGRATION.md`'s "Listing posts/reels" section for why this can't be a plain
`GET /v1/posts/{postId}` passthrough (that endpoint doesn't support the synced posts this
project lists).

Response (`200`): same shape as one item of the list endpoint's `posts` array above.

Errors: `404` (not a member, `:accountId` not found under this organization, or `:postId` not
found under `:accountId`).

### `GET /api/organizations/:organizationId/instagram/accounts/:accountId/posts/:postId/automations`

Lists the comment automation(s) for a specific post (Phase 10) — in practice `0` or `1` items,
since Zernio only allows one active per-post automation (`docs/ZERNIO-INTEGRATION.md`).
Requires a bearer token; same 404 checks as the posts endpoints above.

Response (`200`):
```json
[
  {
    "id": "clx...",
    "zernioPostId": "6a7988dfd0fe733d1ab80576",
    "name": "Watch giveaway",
    "keywords": ["LINK", "link", "price"],
    "matchMode": "CONTAINS",
    "commentReply": "Check your DMs!",
    "dmMessage": "Here is the link you asked for!",
    "isActive": true
  }
]
```

### `POST /api/organizations/:organizationId/instagram/accounts/:accountId/posts/:postId/automations`

Creates a comment-to-DM automation for a specific post, via Zernio's real
`POST /v1/comment-automations` (`docs/ZERNIO-INTEGRATION.md`). Requires a bearer token; same
404 checks as above.

Request:
```json
{
  "name": "Watch giveaway",
  "keywords": ["LINK", "link", "price"],
  "matchMode": "contains",
  "commentReply": "Check your DMs!",
  "dmMessage": "Here is the link you asked for!"
}
```
`keywords`: array of 1-50 non-empty strings, **not a single string** — matches Zernio's own
field shape. `matchMode`: `contains` (default) | `word` | `exact`. `commentReply`: optional.
`dmMessage`: required, ≤1000 chars.

Response (`201`): same shape as one item of the list endpoint's array above.

Errors: `400` (invalid input, e.g. no keywords), `404` (not a member, or `:accountId` not
found under this organization), `409` (this post already has an automation — enforced both
locally and by Zernio's own rule; also returned if Zernio itself already has one for this
post that our own database didn't know about, e.g. created directly in Zernio's dashboard).

Further endpoints are documented here as each is actually implemented, with full request/
response shape, auth requirement, and example — not speculatively written ahead of the
NestJS controller that implements it, to avoid this document drifting from reality. Track
"next endpoint to document" via `docs/IMPLEMENTATION-ROADMAP.md`.
