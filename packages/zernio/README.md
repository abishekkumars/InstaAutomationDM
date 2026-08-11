# packages/zernio

`InstagramProvider` abstraction and the `ZernioInstagramProvider` implementation. Owns all
direct calls to the Zernio API/SDK so `apps/api` never talks to Zernio directly — see
[docs/ZERNIO-INTEGRATION.md](../../docs/ZERNIO-INTEGRATION.md).

Builds to `dist/` via `tsc` (`module: commonjs`), the same pattern `packages/database`/
`packages/shared`/`packages/validation` use.

## Status (Phase 10)

Account connection is real: `ensureProfile` (`POST /v1/profiles`), `getConnectUrl`
(`GET /v1/connect/instagram`), and `findConnectedAccount` (`GET /v1/accounts`) all make live
Zernio calls, verified directly against Zernio's live OpenAPI spec during Phase 8 — see
`docs/ZERNIO-INTEGRATION.md`'s "Account connection" section for the full flow and why
`InstagramProvider`'s shape changed from Phase 7's speculative
`connectAccount(code, redirectUri)` once the real API turned out not to hand us an
authorization code at all.

Listing posts/reels is real as of Phase 9: `listPosts` (`GET /v1/posts?source=external`) and
`getPost`. `getPost` does **not** call `GET /v1/posts/{postId}` — verified live that this
endpoint 404s for every `source: external` post this project needs, so it searches a
`listPosts` call (`limit: 500`) instead. See `docs/ZERNIO-INTEGRATION.md`'s "Listing
posts/reels" section for the full detail.

Comment automations are real as of Phase 10: `createCommentAutomation`
(`POST /v1/comment-automations`) — `keywords` is a real string array (Zernio's own field
shape), matching multiple keywords per automation, not one. Verified live that Zernio
executes the entire keyword-match → public-reply → DM flow server-side once created, which
is why `packages/automation-engine` (planned in the original design) was never built — see
`docs/AUTOMATION-ENGINE.md`'s "Resolved" section and `docs/ZERNIO-INTEGRATION.md`'s
"Comment-to-DM automation API" section for the full detail.
