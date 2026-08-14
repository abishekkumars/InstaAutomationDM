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

**Amended 2026-08-14 (Phases 15-16).** A 20-requirement change request altered how items 1-2
work and extended item 6. In summary:

- **Item 1 (authentication)** now also offers Google sign-in beside email/password, requires a
  password confirmation at sign-up, and ends a session after 30 minutes of inactivity — see
  `docs/ADR/0008-google-signin-and-session-lifetime.md`.
- **Item 2 (organization/multi-tenancy)** is no longer self-service. Registration lands
  directly on the dashboard, and an administrator admits the user by assigning them an
  organization. Multi-tenancy itself is unchanged. See
  `docs/ADR/0007-global-user-roles-and-administration.md`.
- **Item 6 (create a comment automation)** gained three Zernio capabilities this project had
  documented but never used: an "any comments" trigger, a followers-only/non-followers
  audience filter, and up to five public replies rotated at random.

The 13-item list itself still describes the product. Nothing was added to it and nothing was
dropped from it.

## Explicitly out of scope (retired, not deferred — see ADR 0005)

- Story reply triggers — also a real Zernio/Meta limitation regardless (see
  `docs/ZERNIO-INTEGRATION.md`), but moot either way since this scope is comment triggers
  only.
- A generic trigger/condition/action workflow engine, or any visual workflow builder UI.
- Contact management / CRM, an inbox/conversations UI.
- Follow-up workflows, delays, branching.
- Billing, plans, usage limits.
- ~~Team roles beyond what Phase 4's `OrganizationRole` vocabulary already provides.~~
  **Amended 2026-08-14 by `docs/ADR/0007-global-user-roles-and-administration.md`**: a single
  additional *global* role axis (`UserRole`: `ADMIN` | `NORMAL_USER`) now exists, so that one
  administrator can admit users and assign them to organizations. This is deliberately narrow —
  it is not general RBAC, not per-resource permissions, and it does not change tenant isolation
  or `OrganizationRole`, which keeps its Phase 4 meaning. Anything broader remains out of scope.
- An analytics pipeline beyond the basic per-automation status/history in item 13.
- Multiple automations per post/reel, or automations scoped to "any post" — one automation
  per specific post/reel, matching the MVP list exactly.

Any of the above could return as a genuine future requirement, but it would get its own ADR
and its own roadmap phase at that point — it is not "coming later" on the current plan.

## Functional requirements (MVP)

- FR1: A user can sign up, with email/password or with Google, and lands on the dashboard.
  **Amended Phase 15.3**: they are no longer placed into a new organization automatically.
  Until an administrator assigns them one they see an "awaiting access" state and can reach
  nothing — organization membership is the access gate (see FR8). Original Phase 5-6 behaviour
  was self-service organization creation at `/onboarding`, which has been removed.
- FR2: An organization member can connect an Instagram account through Zernio's OAuth flow.
- FR3: An organization member can list an account's posts/reels (paginated per Zernio's own
  mechanism) and open one.
- FR4: From a specific post/reel, a member can configure and save one automation: a
  keyword (or short keyword list) with a match mode, a public reply template, and a DM
  template. **Extended Phase 16.2**: the trigger may instead be "any comment" (no keywords);
  the automation may be restricted to followers or non-followers; and the public reply may
  carry up to five alternates, one of which Zernio picks at random per triggering comment.
- FR5: An incoming Zernio webhook for a matching comment on a tracked post/reel causes the
  saved automation's public reply and DM to be sent.
- FR6: A member can view basic status/history for an automation (did it trigger, did the
  reply/DM succeed).
- FR7: An organization cannot see or affect another organization's accounts or automations,
  under any code path (already proven for organizations/membership in Phase 6; extends to
  every tenant-owned table added from here on). **Unchanged by Phases 15-16**, including for
  administrators: the Administration surface manages users, organizations and memberships and
  reads no tenant data at all.
- FR8 (Phase 15.2/15.3): An administrator can see every user, grant or revoke administrator
  status, and assign users to organizations. A user with no organization membership can reach
  no tenant data and connect no Instagram account — membership *is* the permission, rather
  than a second flag beside it. Revoking the last remaining administrator is refused, so the
  surface cannot be locked away. See
  `docs/ADR/0007-global-user-roles-and-administration.md`.

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
