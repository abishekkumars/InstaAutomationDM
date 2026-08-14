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

### `GET /api/me`

The caller's own identity as `apps/api` resolved it (Phase 15.1). Requires a bearer token.

Response (`200`):
```json
{ "id": "clx...", "email": "alice@example.com", "role": "NORMAL_USER" }
```

`role` is the **global** role (`ADMIN` | `NORMAL_USER`), not an organization role — see
`docs/SECURITY.md`'s "Global user roles" section for why the two are separate. Three
properties of this endpoint are deliberate and covered by tests:

- **`role` and `email` both come from the `users` row**, not from the bearer token's claims.
  A token carrying `role: "ADMIN"` for a `NORMAL_USER` account still returns `NORMAL_USER`,
  and a token carrying someone else's `email` returns the real one.
- **Granting or revoking admin takes effect on the very next request**, with no need to wait
  for the caller's token to expire or for them to sign in again.
- **Nothing beyond `id`/`email`/`role` is returned** — never `passwordHash`.

Errors: `401` (missing/invalid token, or a structurally valid token whose user has since been
deleted).

Consumed by `apps/web` to decide whether to render the Administration nav item. Note that this
endpoint is for *display*: any check that actually gates an action is enforced in `apps/api` at
that action's own route, never by trusting the client to have hidden a button.

### ~~`POST /api/organizations`~~ — removed in Phase 15.3

Self-service organization creation is gone. It let any authenticated user create an
organization and make themselves its `OWNER`, which was correct while `/onboarding` was the way
in — and became a hole once organization membership became the access gate (requirement 16):
a user waiting to be admitted could admit themselves.

Creating organizations now lives at **`POST /api/admin/organizations`**, behind `AdminGuard`.
The route no longer exists at all (`404`), which is asserted by a test rather than assumed. See
`docs/ADR/0007-global-user-roles-and-administration.md`.

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
as `GET /api/organizations/:id/members`). Resolves the organization's Zernio profile on first
call (persists `Organization.zernioProfileId`); reuses it on every later call — including
re-adopting a pre-existing Zernio profile with the same name rather than creating a duplicate.
See `docs/ZERNIO-INTEGRATION.md`'s "Zernio profiles" and "Account connection" sections.

The response is **discriminated on `alreadyConnected`**, because this endpoint short-circuits
when Zernio already reports a connected Instagram account for the profile — there is no reason
to send the user through OAuth for a connection they already have.

Response (`201`) — nothing connected yet, authorize normally:
```json
{ "alreadyConnected": false, "authUrl": "https://www.facebook.com/v21.0/dialog/oauth?client_id=..." }
```
`apps/web`'s server action redirects the browser to `authUrl` — this is a real redirect to
an external origin, not a route within this app.

Response (`201`) — already connected; the account was reconciled into `instagram_accounts`
(upserted on `zernioAccountId`, never a duplicate row) and no OAuth round trip is needed:
```json
{
  "alreadyConnected": true,
  "account": { "id": "...", "zernioAccountId": "...", "username": "acme_ig", "status": "CONNECTED" }
}
```
An account already connected to a *different* organization is never adopted here — that case
returns the normal `alreadyConnected: false` shape and lets the callback raise its `409`.

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
    "audience": "ANY",
    "commentReply": "Check your DMs!",
    "commentReplyVariations": ["On its way!"],
    "buttons": [{ "title": "Shop now", "url": "https://example.com/shop" }],
    "dmMessage": "Here is the link you asked for!",
    "isActive": true
  }
]
```
`buttons`: `[]`/omitted when the automation has none — a plain-text DM is normal.

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
  "audience": "follower",
  "commentReply": "Check your DMs!",
  "commentReplyVariations": ["On its way!", "Just DMed you."],
  "buttons": [{ "title": "Shop now", "url": "https://example.com/shop" }],
  "dmMessage": "Here is the link you asked for!"
}
```
`keywords`: array of up to 50 non-empty strings, **not a single string** — matches Zernio's own
field shape. **An empty array is valid and means "any comment on this post triggers"** (Phase
16.2, requirement 12) — Zernio's own semantics for an empty keyword list, and what the create
wizard's "Any comments" tab sends. It must be sent as `[]` rather than omitted; the two are not
interchangeable. `matchMode` is ignored when `keywords` is empty, since there is nothing to
match against.

`audience` (Phase 16.2, requirement 11): `any` (default) | `follower` | `non_follower` —
restricts who gets answered, via Zernio's `audience.followerStatus`. **Best-effort**: Instagram
only reveals the follow relationship for people who have messaged the account before, and
anyone whose status cannot be determined is still sent to (Zernio's `whenUnknown` default,
which this project does not override). Returned in the enum's stored casing (`ANY` /
`FOLLOWER` / `NON_FOLLOWER`), accepted in Zernio's lowercase form.

`commentReply`: optional. `commentReplyVariations` (Phase 16.2, requirement 13): optional, up
to **5** alternate public replies. **Zernio picks one at random per triggering comment** from
`[commentReply, ...commentReplyVariations]` — it does not post all of them. Requires a
`commentReply` to rotate against; variations without one are a `400`.

`buttons`: optional, up to 3, each `{title (≤20 chars), url}` — only `type: "url"` buttons are
supported (see `docs/ZERNIO-INTEGRATION.md` for why `postback`/`phone` aren't). `dmMessage`:
required, ≤1000 chars normally, **≤640 once any `buttons` are present** (Zernio's own limit —
a request with `buttons` and a longer `dmMessage` is a `400`, not silently truncated).

Response (`201`): same shape as one item of the list endpoint's array above.

Errors: `400` (invalid input — e.g. more than 5 reply variations, or variations with no
`commentReply`; note that an *empty* `keywords` array is **not** an error as of Phase 16.2),
`404` (not a member, or `:accountId` not
found under this organization), `409` (this post already has an automation — enforced both
locally and by Zernio's own rule; also returned if Zernio itself already has one for this
post that our own database didn't know about, e.g. created directly in Zernio's dashboard).

### `GET /api/organizations/:organizationId/automations`

Lists every automation in the organization, across every connected Instagram account (Phase
10.1) — the redesigned dashboard's data source. Unlike the per-post endpoint above, this has
no `:accountId`/`:postId` segment; it's a separate controller
(`OrganizationAutomationsController`), not a second method on the per-post one. Requires a
bearer token; `404` for a caller who isn't a member of `:organizationId`.

Response (`200`):
```json
[
  {
    "id": "clx...",
    "zernioPostId": "6a7988dfd0fe733d1ab80576",
    "instagramAccountId": "clx...",
    "accountUsername": "acme_ig",
    "name": "Watch giveaway",
    "keywords": ["LINK", "link", "price"],
    "matchMode": "CONTAINS",
    "audience": "ANY",
    "commentReply": "Check your DMs!",
    "commentReplyVariations": ["On its way!"],
    "buttons": [{ "title": "Shop now", "url": "https://example.com/shop" }],
    "dmMessage": "Here is the link you asked for!",
    "isActive": true,
    "stats": { "dmsSent": 129, "linkClicks": 28, "clickThroughRate": 24.3 },
    "post": {
      "caption": "Handmade tote reel",
      "thumbnailUrl": "https://cdn.instagram.com/...",
      "permalink": "https://instagram.com/p/abc123"
    }
  }
]
```
Ordered newest-first. `accountUsername` is the connected account's own `username` (nullable,
same as elsewhere in this app — not guaranteed to be set).

`stats` and `post` (Phase 10.3) are fetched **live from Zernio** on every request and never
stored locally (per `docs/ADR/0005`):

- `stats` comes from `GET /v1/comment-automations?profileId=` — the only Zernio endpoint that
  returns the richer stats shape. **`null` when Zernio is unreachable or has no matching
  automation**, which is deliberately distinct from zeroed counters: the dashboard renders an
  em dash for `null` so a failed fetch never reads as "this automation has sent nothing".
- `clickThroughRate` is a percentage computed as `linkClicks / trackedSends * 100`.
  `trackedSends` — not `dmsSent` — is the denominator Zernio's own spec mandates, since a DM
  with no tracked link can never be clicked. It is `null` when `trackedSends` is 0.
- `post` is the automation's post preview, resolved from one `listPosts` call per distinct
  connected account. `null` when the post can't be resolved.
- `isActive` prefers Zernio's own value over the locally stored copy — this project has no
  edit/pause endpoint, so a toggle flipped in Zernio's dashboard would otherwise never show.

Errors: `401` (no/invalid bearer token), `404` (not a member of `:organizationId`). A Zernio
outage does **not** produce an error here — it degrades to `stats: null` / `post: null`.

## Administration (`/api/admin/*`, Phase 15.2)

Every route below requires a bearer token **and** the caller's global role to be `ADMIN`.
Enforced by `SessionGuard` followed by `AdminGuard`, in that order — the first resolves the
role from the `users` table, the second acts on it. Non-admin callers get `403`
(`"Administrator access is required."`), not `404`: unlike tenant-owned resources, the
existence of these routes is not a secret worth hiding, and a `404` would make a legitimate
administrator's misconfiguration look like a broken deployment.

**These endpoints grant no tenant data access.** They manage *who belongs where* — never an
organization's automations, Instagram accounts, or posts. An administrator who needs to see an
organization's data takes a membership in it, and is then bound by exactly the same isolation
rules as any other member. See `docs/ADR/0007-global-user-roles-and-administration.md`.

### `GET /api/admin/users`

Every user, newest first (the screen exists mainly to admit people who just signed up).

```json
[
  {
    "id": "clx...",
    "email": "john@example.com",
    "name": null,
    "role": "NORMAL_USER",
    "createdAt": "2026-08-14T14:43:17.398Z",
    "organizations": [
      { "organizationId": "clx...", "name": "Acme Inc", "slug": "acme", "role": "OWNER" }
    ],
    "suggestedSlug": "john"
  }
]
```

`suggestedSlug` (requirement 5) is derived server-side from the email's local part and stepped
past any slug already taken (`john` → `john-2`). It is a **prefill hint, nothing more** — it is
not reserved, and it can go stale between rendering a form and submitting it, at which point
`POST /api/admin/organizations` returns `409`. The uniqueness guarantee lives in the
`organizations.slug` database constraint, not here. That matters more than it looks: the Zernio
profile name derives from the slug, and `ensureProfile` reuses a profile it finds by name, so
two organizations sharing a slug would share one Zernio profile.

`passwordHash` is never included.

### `GET /api/admin/organizations`

```json
[{ "id": "clx...", "name": "Acme Inc", "slug": "acme", "memberCount": 2 }]
```

### `POST /api/admin/organizations`

Creates an organization. `ownerUserId` is optional; when given, that user is added as `OWNER`
in the same transaction, so "create this org and put this user in it" cannot half-succeed.

Request: `{ "name": "Acme Inc", "slug": "acme", "ownerUserId": "clx..." }`

Response (`201`): `{ "id": "clx...", "name": "Acme Inc", "slug": "acme", "memberCount": 1 }`

Errors: `400` (invalid name/slug — `packages/validation`'s `createOrganizationSchema`: a slug is
lowercase letters, numbers and hyphens only, no leading/trailing/double hyphens, ≤50 chars),
`404` (unknown
`ownerUserId`; nothing is created), `409` (slug taken).

### `POST /api/admin/users/:userId/memberships`

Grants a user access to an organization. **This is the access gate** — a user with no
membership can reach no tenant data and connect no Instagram account (requirement 16).

Request: `{ "organizationId": "clx...", "role": "OWNER" }`

`role` is the *organization* role and defaults to `OWNER`, since the common case is admitting a
new user to their own organization. Pass `MEMBER` explicitly when adding a second person to an
existing one.

Response (`201`): `{ "organizationId": "clx...", "name": "Acme Inc", "slug": "acme", "role": "OWNER" }`

Errors: `400` (missing `organizationId`), `404` (unknown user or organization), `409` (already
a member).

### `DELETE /api/admin/users/:userId/memberships/:organizationId`

Revokes that user's access. `204` on success. The organization itself is **not** deleted —
removing one person's access must never destroy everyone else's data.

Errors: `404` (no such membership).

### `PATCH /api/admin/users/:userId/role`

Grants or revokes the global `ADMIN` role.

Request: `{ "role": "ADMIN" }` or `{ "role": "NORMAL_USER" }`

Response (`200`): the updated user, in the same shape `GET /api/admin/users` returns.

Errors: `400` (role not one of the two values), `404` (unknown user), `409` (**revoking the
last remaining administrator**).

That `409` is a deliberate lockout guard: without it the final administrator could revoke
themselves and leave this entire surface permanently unreachable, with nobody left able to grant
it back. An administrator *may* step down while another remains — self-demotion is allowed, it
is only being the last one that is refused. `ADMIN_EMAIL` would recover such a lockout on next
sign-in, but only if it happens to be set and to point at a real account, which is too thin a
thread to rely on.

Further endpoints are documented here as each is actually implemented, with full request/
response shape, auth requirement, and example — not speculatively written ahead of the
NestJS controller that implements it, to avoid this document drifting from reality. Track
"next endpoint to document" via `docs/IMPLEMENTATION-ROADMAP.md`.
