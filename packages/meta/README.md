# @automationdm/meta

Read-only client for Meta's Instagram Graph API (Instagram Login flavour), plus the Business
Login OAuth round trip.

Added in Phase 17. See `docs/ADR/0009-direct-meta-graph-api-for-post-listing.md` for why this
exists at all, and `docs/ZERNIO-INTEGRATION.md` for how it sits alongside `@automationdm/zernio`.

## What this is for

Zernio's post sync is poll-driven and lags a newly published reel by hours, and it only retains
about 12 months of history. Meta returns the same account's media immediately and in full
(measured: 62 posts vs Zernio's 47 on the same account at the same moment). Since the product's
workflow is *publish a reel, then attach a comment automation to it*, that lag is the cost this
package removes.

Automations still go through Zernio. This package never writes anything.

## What it deliberately does not do

- **It cannot tell you a reel is a trial reel.** No such field exists on Meta's media object.
  `trial_params` is publish-time only, and `is_shared_to_feed` is the "Also share to Feed"
  toggle, not a trial marker. Do not add an inference for it; see ADR 0009 for the measurements
  that closed this question.
- No publishing, no comment or message APIs, no insights. Scope requested is
  `instagram_business_basic` only.

## Shape

- `MetaInstagramClient` - `getProfile`, `listMedia`, `getMedia`. Cursor pagination is walked
  internally, bounded to 5 pages (500 items), and reports `truncated` rather than silently
  cutting the list short.
- `meta-oauth` - `buildAuthorizeUrl`, `exchangeCodeForLongLivedToken`, `refreshLongLivedToken`.

Errors are `MetaApiError`. Its `isAuthError` getter distinguishes "the token is dead"
(code 190/102) from "the request was wrong", which is what drives the `RECONNECT_REQUIRED`
account status rather than an endless retry.

**Tokens never appear in error messages.** Every request helper takes a separate loggable path
argument precisely because the real URL carries the access token or app secret in its query
string.
