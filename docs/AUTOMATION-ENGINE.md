# Automation Engine

Status: Phase 0 design, **drastically simplified** per
`docs/ADR/0005-simplified-mvp-architecture.md`; implemented in Phase 10-12. Lives in
`packages/automation-engine`, framework-agnostic (no NestJS, no direct Prisma/Zernio
imports — those are injected as interfaces so it stays unit-testable in isolation), **if it
ends up being needed as separate code at all — see "Open question" below.**

## Model (simplified — one fixed shape, not a generic engine)

An `Automation` is exactly:

- one `Organization`
- one connected `InstagramAccount`
- one specific Zernio post/reel, identified by Zernio's own post/reel id (a plain string —
  the post/reel itself is never stored locally, see `docs/DATABASE.md`)
- one keyword, or a short list of keywords, with a match mode (contains/word/exact)
- one public reply template
- one DM message template
- an active/inactive flag

There is **no** generic `Trigger`/`Condition[]`/`Action[]` graph, no branching, no delays,
no tagging, no multi-step action sequencing. This is exactly MVP items 6-10
(`docs/PRODUCT-REQUIREMENTS.md`) and nothing more. **The engine never executes
arbitrary user-supplied code** — the shape above is the entire vocabulary, fixed and
versioned, matching `CLAUDE.md`'s rule.

## Open question: does our code do the matching, or does Zernio?

Per `docs/ZERNIO-INTEGRATION.md`, Zernio's own `POST /v1/comment-automations` endpoint
already accepts `keywords`, `matchMode`, `commentReply`, and `dmMessage` directly — meaning
Zernio's platform may already execute the entire keyword-match → public-reply → DM flow
server-side, with its webhook only *notifying* us of the outcome (for MVP item 13's status/
history). If that's how it actually works, "the engine" shrinks to: call Zernio's create-
automation endpoint with our config when the user saves one, and record whatever Zernio's
webhook reports afterward — `packages/automation-engine` might end up holding very little
logic, or none worth a separate package.

Alternatively, if Zernio only offers a generic "new comment on this post" notification
without doing the matching itself, this package does need real logic: match the incoming
comment's text against the saved automation's keyword(s), then call `packages/zernio` to
send the public reply and the DM.

**This is not decided here** — per `CLAUDE.md`'s "never invent Zernio API behavior" rule,
it gets resolved by reading Zernio's real, current docs during Phase 10/11 implementation,
not assumed in this design document. Both outcomes fit the same database shape
(`docs/DATABASE.md`'s `automations`/`automation_runs`) and the same webhook contract
(`docs/WEBHOOKS.md`) — only the amount of matching logic *inside* `apps/api`/
`packages/automation-engine` changes.

## Execution flow (if local matching is needed)

Entry point: `POST /webhooks/zernio` (`docs/WEBHOOKS.md`), in-process, no queue.

1. Resolve organization + Instagram account (already done by the webhook handler before
   this is called — never re-derived from client input).
2. Look up the one active `Automation` for that account + the incoming event's post/reel id.
   (Not "automations" plural with independent matching per candidate — there is exactly one
   automation per post/reel in this simplified model, so there's nothing to disambiguate.)
3. If a keyword match is needed locally: check the comment text against the automation's
   keyword(s) using its match mode.
4. If matched: send the public reply, send the DM (both via `packages/zernio`), record an
   `automation_runs` row with the outcome.
5. If either action fails, record that in the run's outcome — still respond `200` to Zernio
   either way (the webhook was received and processed; an automation-side failure isn't a
   webhook delivery failure).

## Testing

Unit tests target `packages/automation-engine` directly (if it exists as real code after
the "Open question" above is resolved) with a fake Zernio provider — no NestJS, no real
database, no network. Keyword-match edge cases (case sensitivity, `contains`/`word`/`exact`
modes) get their coverage here, matching `docs/TESTING.md`.
