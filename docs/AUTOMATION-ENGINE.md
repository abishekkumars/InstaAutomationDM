# Automation Engine

Status: Phase 0 design, implemented in Phase 12. Lives in `packages/automation-engine`,
framework-agnostic (no NestJS, no direct Prisma/Zernio imports — those are injected as
interfaces so the engine is unit-testable in isolation).

## Model

```
Automation
  ├── Trigger        (exactly one)
  ├── Conditions[]    (zero or more, all must pass — AND semantics for MVP)
  └── Actions[]        (ordered, executed in sequence)
```

This is a data model, not code — an `Automation` is rows in `automation_triggers` /
`automation_conditions` / `automation_actions`, never a user-supplied script. **The engine
never executes arbitrary user-supplied JavaScript**, per master prompt section 12 — every
condition/action is one of a fixed, versioned set of types below, each with a typed config
object validated by a Zod schema in `packages/validation`.

## Trigger types

`COMMENT`, `COMMENT_KEYWORD`, `DM`, `DM_KEYWORD`, `STORY_REPLY` (pending confirmation of
Zernio/Meta support — see `docs/ZERNIO-INTEGRATION.md` limitations section).

## Condition types

`KEYWORD_MATCH`, `CONTAINS_TEXT`, `EQUALS_TEXT`, `ACCOUNT_MATCH`, `POST_MATCH`,
`TAG_EXISTS`, `CONTACT_EXISTS`.

## Action types

`PUBLIC_COMMENT_REPLY`, `SEND_DM`, `SEND_DM_BUTTON`, `ADD_TAG`, `REMOVE_TAG`,
`CREATE_CONTACT`, `WAIT`, `FOLLOW_UP`.

Adding a new type in any of the three lists means: add the enum value, add its Zod config
schema, add its handler (a small class/function implementing a `ConditionEvaluator` or
`ActionExecutor` interface), register it in a lookup map. No other code changes — this is
the "extensible without hardcoding every automation type" requirement from the master
prompt.

## Execution flow

Entry point: the `webhook-processing` worker calls
`automationEngine.handleEvent(resolvedEvent)` after resolving `organization_id` /
`account_id` (see `docs/WEBHOOKS.md`).

1. Resolve organization (already done by the caller — passed in, never re-derived from
   client input).
2. Resolve Instagram account.
3. Query active automations for that account, filtered to ones whose trigger type matches
   the incoming event type.
4. For each candidate automation (there may be more than one — e.g. an account-wide
   automation and a post-specific one — both can fire independently, each gets its own run):
   a. Match trigger (does this event satisfy the trigger's scope — right post, right
      account, right event kind).
   b. Evaluate conditions in order; short-circuit on first failure.
   c. If trigger matched and all conditions passed: create an `automation_runs` row
      (`status='running'`).
   d. Execute actions in order, writing one `automation_run_steps` row per action
      (`status='succeeded'|'failed'`, request/response summary — never the full Zernio
      secret/token — timestamps).
   e. An action failure does not necessarily stop the run — `WAIT`/tagging failures are
      non-fatal; a `SEND_DM` failure is logged but subsequent independent actions (e.g. a
      later `ADD_TAG`) still attempt to run, since they're not dependent on the DM having
      sent. The run's overall `status` becomes `partial` if some but not all steps
      succeeded, `failed` if the primary action failed, `succeeded` if all did.
5. Update `analytics_daily` counters for the automation (`triggered`, and per-action-type
   counts).

## Idempotency within the engine

The engine itself does not re-check webhook-level idempotency (that's already guaranteed
by the caller per `docs/WEBHOOKS.md` — the engine is only ever invoked once per real
event). What the engine *does* guard against: the same automation matching the same event
twice due to overlapping scope (e.g. both an account-wide and a post-specific automation
matching one comment) — this is intentional (both should run), not a bug, and is called out
here so it isn't "fixed" as a duplicate-run bug later.

## Testing

Unit tests target `packages/automation-engine` directly with fake `ConditionEvaluator`/
`ActionExecutor` implementations and a fake Zernio provider — no NestJS, no real database,
no network. This is where keyword-match edge cases, condition short-circuiting, and
action-failure/partial-run semantics get their coverage (see `docs/TESTING.md`).
