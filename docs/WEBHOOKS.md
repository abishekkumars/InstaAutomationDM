# Webhook Contract

Status: Phase 0 design, simplified per `docs/ADR/0005-simplified-mvp-architecture.md`,
implemented in Phase 11. Covers the single inbound endpoint that receives Zernio events.

## Endpoint

```
POST /webhooks/zernio
```

Public, unauthenticated by session (Zernio can't log in), but **must** verify the
`X-Zernio-Signature` HMAC-SHA256 header against `ZERNIO_WEBHOOK_SECRET` before doing
anything else. See `docs/ZERNIO-INTEGRATION.md` for the signature scheme.

## Processing steps (all inside the `webhooks` NestJS module, in-process — no queue)

1. Read raw body (needed for HMAC verification — do not let a body parser mutate it first).
2. Verify signature. Invalid/missing signature → `401`, log and stop. No DB write.
3. Validate payload shape with a Zod schema from `packages/validation` (one schema per
   Zernio `event_type` we support; unrecognized `event_type` → `202 Accepted`, log, and
   store as `status: 'received'` for later triage rather than 4xx-rejecting a payload shape
   we simply haven't built support for yet).
4. Insert into `webhook_events` with `(provider='zernio', event_id, event_type, payload,
   status='received', received_at=now())`.
   - Unique constraint on `(provider, event_id)`. A unique-violation here means this exact
     event was already received — catch it, respond `200 OK`, and do nothing further. This
     is the entire idempotency mechanism; Postgres is the only source of truth needed.
5. Resolve `organization_id`/`account_id` from the payload's Zernio account identifier
   (lookup in `instagram_accounts`); if no match, mark `status='failed'`,
   `error_message='unknown account'`, and stop.
6. Find the matching automation for that account + post/reel (+ keyword, if matching is our
   own responsibility rather than Zernio's — see `docs/AUTOMATION-ENGINE.md` for why this
   isn't decided yet) and execute its actions (public reply + DM, via `packages/zernio`) —
   **directly in this same request**, per ADR 0005 (no BullMQ, no `apps/worker`).
7. Record the outcome (`automation_runs`, `docs/AUTOMATION-ENGINE.md`) and update
   `webhook_events.status` (`'processed'` or `'failed'` + `error_message`).
8. Return `200 OK`.

**Why in-process is fine here**: total expected volume is under 1,000 calls/month. Step 6's
work is bounded — at most a couple of outbound Zernio REST calls per matched automation, not
a fan-out job graph — so there's no meaningful risk of the handler blocking Zernio's own
retry/timeout budget at this scale. If that assumption ever stops holding (measured, not
guessed), moving step 6 behind a queue is an additive change on top of the same
`webhook_events` row, not a redesign — see ADR 0005's "Consequences."

## `webhook_events` table

See `docs/DATABASE.md` for the full column list. Key point repeated here because it's the
crux of this contract: `unique (provider, event_id)` is what makes step 4 above safe to
call from a handler that Zernio may call more than once for the same event (at-least-once
delivery, per Zernio's own docs).

## Testing

- Unit: signature verification (valid, invalid, missing secret configured, missing header),
  payload schema validation per event type.
- Integration: POST the same payload twice → one `webhook_events` row, one execution (not
  two DMs sent).
- Integration: POST with a bad signature → `401`, zero DB rows.
- Use Zernio's own `POST /v1/webhooks/test` sandbox endpoint for realistic payloads during
  manual verification; automated tests still use fixture payloads/mocks, never live Zernio
  calls (per `docs/TESTING.md`).
