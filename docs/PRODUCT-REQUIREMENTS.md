# Product Requirements

Status: **Scope simplified 2026-08-11** — see
`docs/ADR/0005-simplified-mvp-architecture.md`. This supersedes the original, broader SaaS
framing below the "Vision" section's history note.

## Vision

A small, internal/limited-use tool (~3-4 users, under 1,000 API calls/month) for connecting
one or more Instagram accounts (via Zernio) and attaching a single keyword-triggered
comment-automation to a specific post or reel: a commenter who uses the configured keyword
gets a public reply and a DM. Not a general-purpose multi-tenant SaaS, not a
SuperProfile/ManyChat competitor — the earlier framing below this note described that larger
product; it's kept here as history, not as the current target.

<details>
<summary>Original vision statement (superseded, kept for history)</summary>

A multi-tenant SaaS where creators/businesses connect Instagram accounts (via Zernio) and
build automations that react to comments, DMs, and story replies with public replies,
private DMs, and DM buttons/links — tracking contacts, executions, and delivery metrics
along the way. Conceptually similar to SuperProfile / AutoDM/ManyChat-style comment-to-DM
tools, scoped initially to what Zernio's Instagram integration actually supports.

</details>

## Primary persona

One of the small number of people using this internal tool, who wants a specific Instagram
post/reel to auto-reply and auto-DM commenters who use a chosen keyword, without needing to
do it by hand or pay for a third-party point-and-click tool.

## MVP scope (exactly this, nothing more)

1. Authentication.
2. Organization/multi-tenancy.
3. Connect Instagram through Zernio.
4. List Instagram posts/reels with pagination.
5. Click a post/reel.
6. Create a comment automation for that specific post/reel.
7. Configure keyword.
8. Configure public comment reply.
9. Configure private DM.
10. Save the automation.
11. Receive the relevant Zernio webhook.
12. Trigger the configured automation.
13. Basic automation status/history.

Items 1-2 are done (Phase 5-6). See `docs/IMPLEMENTATION-ROADMAP.md` for the phase mapping
of the rest.

## Explicitly out of scope (retired, not deferred — see ADR 0005)

- Story reply triggers — also a real Zernio/Meta limitation regardless (see
  `docs/ZERNIO-INTEGRATION.md`), but moot either way since this scope is comment triggers
  only.
- A generic trigger/condition/action workflow engine, or any visual workflow builder UI.
- Contact management / CRM, an inbox/conversations UI.
- Follow-up workflows, delays, branching.
- Billing, plans, usage limits, team roles beyond what Phase 4's `OrganizationRole` vocabulary
  already provides.
- An analytics pipeline beyond the basic per-automation status/history in item 13.
- Multiple automations per post/reel, or automations scoped to "any post" — one automation
  per specific post/reel, matching the MVP list exactly.

Any of the above could return as a genuine future requirement, but it would get its own ADR
and its own roadmap phase at that point — it is not "coming later" on the current plan.

## Functional requirements (MVP)

- FR1: A user can sign up and is placed into a new organization as its owner (done, Phase
  5-6).
- FR2: An organization member can connect an Instagram account through Zernio's OAuth flow.
- FR3: An organization member can list an account's posts/reels (paginated per Zernio's own
  mechanism) and open one.
- FR4: From a specific post/reel, a member can configure and save one automation: a
  keyword (or short keyword list) with a match mode, a public reply template, and a DM
  template.
- FR5: An incoming Zernio webhook for a matching comment on a tracked post/reel causes the
  saved automation's public reply and DM to be sent.
- FR6: A member can view basic status/history for an automation (did it trigger, did the
  reply/DM succeed).
- FR7: An organization cannot see or affect another organization's accounts or automations,
  under any code path (already proven for organizations/membership in Phase 6; extends to
  every tenant-owned table added from here on).

## Non-functional requirements

- The webhook endpoint responds promptly. At this project's actual volume (<1,000 calls/
  month total), in-process handling — no queue — is sufficient; see ADR 0005.
- Webhook duplicate deliveries never double-send a DM (idempotency on Zernio event id, via
  `webhook_events`).
- No Zernio credentials or Instagram tokens ever reach the browser.
- All tenant-owned queries are authorized server-side against the caller's org membership.

## Success criteria for the MVP milestone

A real (or Zernio test-mode) Instagram comment containing the configured keyword, on the
specific post/reel an automation was saved for, results within a few seconds in: a public
reply visible on the post, a DM delivered to the commenter, and that outcome visible in the
automation's basic status/history — end to end, with tests covering each stage per
`docs/TESTING.md`.
