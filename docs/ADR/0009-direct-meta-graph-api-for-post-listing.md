# ADR 0009: Meta Graph API as the primary source for listing posts/reels

## Status
Accepted.

## Context

The requirement that prompted this arrived as: *"trial reels posted from the Instagram app
are not listed on the post page, so no automation can be attached to them; Zernio says trial
reels are out of scope."*

Investigation on 2026-08-19, against Meta's live documentation and a real connected account,
disproved the premise and replaced it with a different, larger problem.

### What was measured, not assumed

**1. Trial reels are not excluded from Zernio.** A trial reel published from the Instagram app
on 2026-08-18 was absent from Zernio at first and **present the following day**.
`docs/ZERNIO-INTEGRATION.md` previously stated such reels were *"invisible to Zernio and
therefore to this project - permanently, not just until the next sync"*. That statement was
false and has been corrected as part of this change.

**2. Trial reels cannot be identified through the Meta API at all.** The complete readable
field list on the IG Media object contains no trial or graduation field:

```
alt_text, boost_ads_list, boost_eligibility_info, caption, comments_count,
copyright_check_information.status, id, is_ai_generated, is_comment_enabled,
is_shared_to_feed, legacy_instagram_media_id, like_count, media_audio_type,
media_product_type, media_type, media_url, owner, permalink, shortcode,
thumbnail_url, timestamp, username, view_count, reposts_count, saved_count,
shares_count, total_comments_count, total_like_count, total_views_count
```

`trial_params` / `trial_params.graduation_strategy` exist **only on the publish path** (the
container-creation call), as write-time intent. They are not readable back.

`is_shared_to_feed` was evaluated as a proxy and rejected on evidence: it is the "Also share
to Feed" toggle (`true` = Feed *and* Reels tabs, `false` = Reels tab only), and Meta documents
it as a hint rather than a guarantee. On the test account **22 of 57 reels** carry
`is_shared_to_feed: false`, spread continuously from 2025-07-24 to 2026-08-18. As a trial
filter it would return 22 candidates where at most a handful of trials exist.

**Conclusion: labelling a post as a trial reel is not possible, by any field or combination
of fields, and this project will not pretend otherwise.**

**3. The real gap is freshness and retention.** Measured on the same account, same moment:

| Source | Posts returned | Freshness |
|---|---|---|
| Meta `GET /me/media` | **62** (57 `REELS`, 5 `FEED`) | immediate |
| Zernio `GET /v1/posts?source=external` | **47** | poll-driven; observed hours-to-a-day behind |

Following Meta's `paging.cursors.after` returned `{"data": []}`, confirming 62 as the complete
total. The 15-item difference decomposes cleanly, with no trial-specific exclusion anywhere:

- 1 item - the newest post, not yet synced by Zernio
- ~14 items - older than Zernio's ~12-month retention window (all dated <= 2025-08-13)

### Why this matters to the product

The workflow this application exists to serve is *publish a reel, then attach a comment-to-DM
automation to it*. Early comments are the ones that drive reach, so an automation that only
becomes attachable hours after publishing has already missed the window it was created for.
Zernio has **no re-sync or refresh endpoint** to hurry this along.

### The finding that makes a fix possible

Zernio's `POST /v1/comment-automations` was verified by hand to accept `platformPostId`
**without** the companion `postId`, and the resulting automation fires correctly on a real
comment. Zernio's own spec describes `postId` as *"required only when also targeting a
specific post via platformPostId"*, which had been read as mandatory in this codebase.

This is load-bearing. Zernio's `postId` is its internal `_id`, which does not exist until
Zernio has synced the post. Without this finding, a post sourced from Meta could be displayed
but never automated - a listing with a dead "Create automation" button, which is worse than
not listing it at all.

## Decision

**Read posts from Meta's Graph API directly, with Zernio retained as a fallback. Keep Zernio
as the sole system of record for automations.**

1. **`platformPostId` - the Instagram media id - becomes the pivot** for posts and automations
   throughout the stack, replacing Zernio's `zernioPostId`. It is the only identifier both
   sources carry, it is what an incoming comment reports, and it is what Zernio's automation
   create actually requires. The `automations` unique constraint, the API route parameter, and
   the `/instagram/posts/[postId]` web route all move onto it.

2. **Meta primary, Zernio fallback.** An account with a valid Meta connection is listed from
   Meta. An account without one - or one whose Meta call fails - falls back to
   `InstagramProvider.listPosts` against Zernio. Listing is a read path and must degrade, never
   fail the page. No merging of the two sources, and therefore no dedupe or conflict rules.

3. **Meta sits behind the existing `InstagramProvider` abstraction.** `apps/api` and `apps/web`
   never call `graph.instagram.com` directly, exactly as they never call Zernio directly. The
   boundary described in `docs/ZERNIO-INTEGRATION.md` is preserved; it simply now has two
   implementations rather than one.

4. **Connection is a real OAuth flow** (Instagram Business Login, `graph.instagram.com`, scope
   `instagram_business_basic` - **superseded, see "Amendment 2026-08-19" below: Meta pins three
   scopes and a subset is rejected**), mirroring the existing Zernio connect/callback structure
   including its "re-confirm with a live call rather than trusting redirect query params"
   discipline. Tokens are **encrypted at rest**.

5. **Meta is read-only.** No publishing, no trial creation, no insights beyond the counts
   already listed.

## Consequences

**Gained**

- A reel is automatable the moment it is published, rather than after Zernio's poll.
- The post list stops being truncated at ~12 months (62 vs 47 on the test account).
- `getPost` becomes a real single-media call. Zernio's `GET /v1/posts/{postId}` 404s for
  `source: external` posts, which forced a 500-item `listPosts` scan as a workaround
  (`docs/ZERNIO-INTEGRATION.md`). Meta's `GET /{media-id}` removes that whenever a Meta
  connection exists.

**Paid**

- **A second connection per account.** Users now connect Instagram twice - once via Zernio for
  automations, once via Meta for listing. This is real friction and is not hidden.
- **A new credential lifecycle.** Meta long-lived tokens expire in 60 days. Refresh is lazy
  and best-effort; a failure surfaces as a `reconnect_required` account status. Zernio
  previously absorbed this entirely.
- **A token at rest.** `docs/SECURITY.md` previously had no encrypted-at-rest requirement
  because this project stored no third-party tokens. It now does.
- **A destructive migration.** `automations.zernio_post_id` is dropped once
  `platform_post_id` is backfilled and verified. Staged as two migrations with a gate between.
- **Bookmarked `/instagram/posts/<zernio-id>` links break.** Acceptable at this project's
  scale (3-4 internal users) and recorded rather than silently accepted.

**Explicitly not changed**

- ADR 0005 stands. No queue, no worker, no object storage, no publishing. This adds one
  read-only outbound integration, not a new architectural tier.
- Zernio remains the system of record for automations, including the reconciliation path in
  `AutomationsService`.

## Alternatives considered

**Do nothing; document the latency.** Cheapest, and correct if the delay were minutes. It is
not - observed behaviour is hours to a day, against a workflow whose value decays in minutes.
Rejected, but this remains the correct fallback if the Meta path proves unmaintainable.

**Detect trial reels and special-case them.** Impossible, as established above. The premise
that trial reels are the problem was itself wrong.

**Publish reels through Zernio so trials are created with `trialParams`.** Would give Zernio
first-class knowledge of every post, but requires building publishing into this project -
contradicting ADR 0005 - and requires the user to stop posting from the Instagram app.
Rejected on both counts.

**Merge Meta and Zernio results.** Guarantees nothing is missing from either side, at the cost
of two calls per page load plus dedupe and conflict rules for disagreeing captions and
thumbnails. Meta was measured to be a strict superset here, so the merge buys nothing real.

**Store a manually pasted Meta token instead of an OAuth flow.** Materially less work and
viable at 3-4 users, but leaves a 60-day manual chore per account and no clean reconnect path.
Rejected in favour of the proper flow.

## Amendment 2026-08-19: the requested scope set is dictated by Meta, not by us

Decision 4 above committed to scope `instagram_business_basic` alone, on the least-privilege
reasoning that this project reads posts and nothing else. **That is not achievable.** Meta's app
configuration pins three scopes together, verified in App Dashboard > Instagram > API setup with
Instagram login > Business login settings, where none of these can be deselected:

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

Requesting a strict subset of the configured scopes makes `GET
https://www.instagram.com/oauth/authorize` fail. The failure is badly mislabelled - it returns:

```
Invalid Request: Request parameters are invalid: Invalid redirect_uri
```

The `redirect_uri` is not the problem. Confirmed by sending the dashboard's own generated Embed
URL, which differs from ours in the `scope` parameter *only*, with a byte-identical
`redirect_uri` of `https://localhost:3000/instagram/meta/callback`: the five-scope URL reaches
the consent screen, the one-scope URL does not. Meta's authorize reference documents neither
scope-subset validation nor this error mapping, so this is recorded from observed behaviour.

`META_SCOPES` therefore lists all three, and `packages/meta/src/__tests__/meta-oauth.test.ts`
asserts the full set rather than the minimal one. **Anyone narrowing it back will break connect
with an error that says nothing about scopes** - hence the test and the comment on the constant.

### What did NOT change

Decision 5 stands: **Meta remains read-only in this codebase.** Holding `manage_comments` and
`manage_messages` is not permission to use them. Nothing calls a Meta comment or message
endpoint; comment automation and DM delivery still run entirely through Zernio, which is still
the system of record for automations. The two extra scopes are granted-but-unexercised.

`instagram_business_content_publish` and `instagram_business_manage_insights` appear in the
dashboard's Embed URL but ARE removable, and are excluded. The test asserts their absence.

### Consequences

- **The consent screen over-asks.** Users approve comment and message access for a feature that
  only lists posts. Unavoidable at the app-config level, and recorded here rather than
  quietly accepted.
- **App Review will require justifying all three.** The honest justification is that this is a
  comment-to-DM automation product; the awkwardness is that those actions run through Zernio's
  app, not this one.
- **`meta_connections.scopes` is written per connection** at connect time
  (`apps/api/src/instagram/meta-connection.service.ts`). Rows created before this change record
  the single old scope and are not backfilled - the column is a record of what was granted at
  the time, and a reconnect refreshes it. Nothing reads it for authorization decisions.
- **If Meta later allows deselecting these**, narrowing the set is a safe change to make
  deliberately: trim the dashboard first, then this constant and its test.

## Amendment 2026-08-19b: redirect URI, and why the failure was opaque

Rollout hit `Invalid Request: Request parameters are invalid: Invalid redirect_uri` on
`instagram.com/oauth/authorize/third_party/error/`.

**Meta collapses every authorize-request problem into that one message.** It never names the URI
it compared against, nor what it disliked. Unregistered URI, wrong scheme, a trailing space, a
scope the app is not configured for - all render identically. That is why the fix here is a local
guard rather than better handling of Meta's response: there is nothing in the response to handle.

Two distinct failure modes were in play, and they need separating because only one of them is
Meta's:

1. **The URI was not registered**, or not character-identical to the registered entry. Only Meta
   can know this. `MetaConnectionService.createAuthorizeUrl` now logs the exact `redirect_uri`,
   `client_id` and `scope` it sends, so the dashboard field can be filled by copy-paste instead of
   retyping. (All three are public values that travel in the user's own browser; the app secret
   and the signed `state` are deliberately not logged.)

2. **The URI was one this deployment cannot serve.** `META_REDIRECT_URI` had been set to
   `https://localhost:3000/...` while `next dev` serves plain HTTP on that host and port. This is
   the worse of the two: Meta may well *accept* such a URI, and the flow then fails only **after**
   the user grants consent, as a browser connection error on the way back - with the authorization
   code already spent. `assertUsableRedirectUri` now rejects it up front, comparing the URI's
   origin against `APP_URL` and naming both values in the error.

Values are also `trim()`ed on read. A single trailing space survives both a dashboard field and a
`.env` line while making the URI non-matching, and produces exactly the same opaque error.

**Local development therefore requires `APP_URL` and `META_REDIRECT_URI` to share an origin.** The
default is plain HTTP (`http://localhost:3000/instagram/meta/callback`). If Meta's dashboard
refuses a non-HTTPS URI, the pair moves together to `https://localhost:3000/...` **and** the dev
server must actually serve TLS (`next dev --experimental-https`) - changing only the env var
recreates failure mode 2.

Whether Meta accepts a `localhost` URI at all is **not** documented either way, and was not
resolved here. If it refuses, local development needs a tunnel (or testing against a deployed
origin); nothing in the code assumes localhost.

### Scope note

`META_SCOPES` requests the three scopes the app is configured for
(`instagram_business_basic`, `instagram_business_manage_comments`,
`instagram_business_manage_messages`) rather than only the one this project exercises. Only
`instagram_business_basic` is needed to read media, so this asks for more access than the feature
uses - a deliberate trade to match the app's configured set, since a mismatch surfaces as the same
undiagnosable `Invalid redirect_uri`. Narrowing the app's configured scopes in the dashboard, then
narrowing `META_SCOPES` to match, remains the cleaner end state and is worth doing once the flow
is confirmed working.
