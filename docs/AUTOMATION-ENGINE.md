# Automation Engine

Status: Phase 10 — the "Open question" below is resolved: Zernio executes the automation
itself, so `packages/automation-engine` was never created. `Automation` creation is real
(`apps/api/src/automations/`); execution/status recording lands in Phase 11/12.

## Model (simplified — one fixed shape, not a generic engine)

An `Automation` is exactly:

- one `Organization`
- one connected `InstagramAccount`
- one specific Zernio post/reel, identified by Zernio's own post/reel id (a plain string —
  the post/reel itself is never stored locally, see `docs/DATABASE.md`)
- a trigger: **either** a short list of keywords with a match mode (contains/word/exact),
  **or** an empty keyword list, which means "any comment on this post" (Phase 16.2)
- an audience restriction: everyone, followers only, or non-followers only (Phase 16.2)
- one public reply template, optionally with up to 5 alternates that Zernio rotates between
  at random, one per triggering comment (Phase 16.2)
- one DM message template, optionally with up to 3 inline link buttons
- an active/inactive flag

There is **no** generic `Trigger`/`Condition[]`/`Action[]` graph, no branching, no delays,
no tagging, no multi-step action sequencing. **The engine never executes arbitrary
user-supplied code** — the shape above is the entire vocabulary, fixed and versioned, matching
`CLAUDE.md`'s rule.

The Phase 16.2 additions did not loosen that. Each is a fixed field with a closed set of
values, passed straight through to a Zernio field of the same shape — not a new axis of
user-defined behaviour. "Any comments" in particular is not a new trigger *type*: it is the
absence of keywords, which Zernio already treats as "match everything."

## Resolved: Zernio does the matching (verified live during Phase 10)

Fetched Zernio's live OpenAPI spec (`docs.zernio.com/api/openapi`) rather than assuming
either outcome. `POST /v1/comment-automations`'s own description: *"Set up keyword triggers
on Instagram/Facebook so commenters automatically receive a DM."* Zernio's platform executes
the entire keyword-match → public-reply → DM flow server-side, using exactly the config we
send it (`keywords`, `matchMode`, `audience`, `commentReply`, `commentReplyVariations`,
`dmMessage`) — it does not just notify us of a raw incoming comment and leave matching to us.

This is worth restating for the Phase 16.2 fields specifically, because two of them look like
behaviour this project might implement and do not: the **follower check** is Zernio's (it is
the only party that can ask Instagram about a follow relationship), and the **random pick
among reply variations** is Zernio's too. This codebase stores the configuration and sends it;
it never evaluates an audience rule or chooses a reply.

Consequence: **`packages/automation-engine` was never created.** There is no local
keyword-matching logic anywhere in this codebase, and there never needs to be one — Phase
10's `Automation` creation
(`apps/api/src/automations/`, `packages/zernio`'s `createCommentAutomation`) is the entire
"engine." Phase 11's webhook handler only *records* what Zernio reports (per-trigger logs,
available via `GET /v1/comment-automations/{id}` and its `logs` array) — it never
re-implements the match/send logic Zernio already ran.

## Execution flow (Zernio-side, for reference)

1. `apps/api`'s `automations` module calls `packages/zernio`'s `createCommentAutomation`
   when a user saves an automation on a post/reel's detail page (Phase 10) - this is the
   entire "creation" step; Zernio takes over from here.
2. A real Instagram comment on that post/reel matching the configured keyword(s) triggers
   Zernio's own server-side flow: post the optional public reply, send the DM - entirely on
   Zernio's infrastructure, not this project's.
3. Phase 11's webhook handler (`docs/WEBHOOKS.md`) and/or Phase 12's status/history view read
   back what happened (Zernio's own trigger logs/stats) - a recording step, not an execution
   step.

## Testing

No `packages/automation-engine` unit tests exist or are needed - there is no local matching
logic to test. `apps/api/src/automations/__tests__/automations.e2e.test.ts` covers automation
*creation* (multiple keywords, tenant isolation, Zernio's 409 for a duplicate per-post
automation) against an in-memory fake `InstagramProvider`, per `docs/TESTING.md` - never a
live Zernio call in the automated suite.
