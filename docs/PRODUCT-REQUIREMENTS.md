# Product Requirements

Status: Phase 0 baseline, living document.

## Vision

A multi-tenant SaaS where creators/businesses connect Instagram accounts (via Zernio) and
build automations that react to comments, DMs, and story replies with public replies,
private DMs, and DM buttons/links — tracking contacts, executions, and delivery metrics
along the way. Conceptually similar to SuperProfile / AutoDM/ManyChat-style comment-to-DM
tools, scoped initially to what Zernio's Instagram integration actually supports.

## Primary persona

An Instagram creator or small business running giveaways/lead-gen via comment keywords
("Comment LINK and I'll DM you the guide"), who today does this manually or via a
point-and-click competitor tool, and wants it automated with visibility into what happened
(who was DMed, did they open it, how many converted).

## MVP scope (build this first, nothing more)

1. Account creation + organization/workspace creation.
2. Connect one Instagram account via Zernio (OAuth).
3. Create one automation: comment trigger → keyword match → public comment reply → private
   DM → DM button/link.
4. Contact is created/updated from the DM recipient.
5. Every trigger match produces an automation run record with per-step status.
6. Basic analytics: triggers matched, DMs sent, DMs failed, per automation.

This is the full path from section 1 of the master prompt, deliberately narrowed — it is
the thinnest end-to-end slice that proves the architecture (webhook → queue → engine →
Zernio → DB → analytics) actually works, per master prompt section 1's instruction not to
build every SuperProfile feature first.

## Explicitly out of scope for MVP (later phases, see roadmap)

- Story reply triggers — **not currently supported by Zernio's Instagram integration**
  (Meta Graph API limitation; confirmed via `docs.zernio.com/platforms/instagram`, see
  `docs/ZERNIO-INTEGRATION.md`). The master prompt lists story replies as a target trigger;
  this is a real external constraint, not a scoping choice, and is called out explicitly so
  it isn't silently designed around later.
- Workflow builder UI (React Flow) — Phase 17.
- Inbox/conversations UI — Phase 18.
- Follow-up workflows / delays / branching beyond a single linear automation — Phase 19.
- Billing, plans, usage limits, team members beyond the org owner — Phase 20.
- Multiple Instagram accounts per organization — supported by the data model from the
  start (see `docs/DATABASE.md`), but the UI/flows for managing many accounts are not an
  MVP requirement.

## Functional requirements (MVP)

- FR1: A user can sign up and is placed into a new organization as its owner.
- FR2: An organization owner can connect an Instagram account through Zernio's OAuth flow.
- FR3: An organization owner can create an automation with: a comment trigger scoped to
  "any post" or a specific post, an optional keyword list with match mode
  (contains/word/exact), a public reply template, a DM template, and 1-3 DM buttons.
- FR4: Incoming Zernio webhooks for matching comment events cause the automation to
  execute: public reply sent, DM sent, contact upserted, run recorded.
- FR5: A user can view a list of automation runs with status (success/partial/failed) and
  drill into per-step detail.
- FR6: A user can view aggregate counts (triggered/sent/failed) per automation per day.
- FR7: An organization cannot see or affect another organization's accounts, automations,
  contacts, or runs, under any code path.

## Non-functional requirements

- Webhook endpoint responds in low tens of milliseconds; all automation execution is
  asynchronous (BullMQ).
- Webhook duplicate deliveries never double-send a DM (idempotency on Zernio event id).
- No Zernio credentials or Instagram tokens ever reach the browser.
- All tenant-owned queries are authorized server-side against the caller's org membership.

## Success criteria for the MVP milestone

A real (or Zernio test-mode) Instagram comment containing the configured keyword results,
within a few seconds, in: a public reply visible on the post, a DM delivered to the
commenter with the configured button, a contact record, an automation run with all steps
`succeeded`, and an incremented daily analytics counter — end to end, with tests covering
each stage per `docs/TESTING.md`.
