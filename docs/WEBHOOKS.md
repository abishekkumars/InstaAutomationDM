# Webhook Contract

Status: Phase 0 design, implemented in Phase 10. Covers the single inbound endpoint that
receives Zernio events.

## Endpoint

```
POST /webhooks/zernio
```

Public, unauthenticated by session (Zernio can't log in), but **must** verify the
`X-Zernio-Signature` HMAC-SHA256 header against `ZERNIO_WEBHOOK_SECRET` before doing
anything else. See `docs/ZERNIO-INTEGRATION.md` for the signature scheme.

## Processing steps (all inside the `webhooks` NestJS module)

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
     is the entire idempotency mechanism; no separate Redis dedup set is needed because
     Postgres is already the source of truth.
5. On successful insert, enqueue a BullMQ job on the `webhook-processing` queue with the
   `webhook_events.id` as payload (not the raw event — the worker re-reads from Postgres,
   so the queue payload stays tiny and there's one source of truth for the data).
6. Update `webhook_events.status = 'queued'`.
7. Return `200 OK`. Total handler time budget: low tens of milliseconds — no Zernio calls,
   no automation logic, no more than the one insert + one enqueue happen in this request.

## Worker side (`apps/worker`, `webhook-processing` queue)

1. Load the `webhook_events` row by id.
2. Resolve `organization_id`/`account_id` from the payload's Zernio account identifier
   (lookup in `instagram_accounts`); if no match, mark `status='failed'`,
   `error_message='unknown account'`, and stop — this is not retried, since a mismatched
   account id will never resolve on retry.
3. Hand off to the automation engine (`packages/automation-engine`) — see
   `docs/AUTOMATION-ENGINE.md` for what happens from here.
4. On success: `status='processed'`, `processed_at=now()`.
5. On unexpected error (e.g. Zernio API timeout during action execution): rely on BullMQ's
   retry/backoff (exponential, small fixed attempt cap) rather than looping inside the job;
   `webhook_events.status` reflects the latest attempt's outcome and `error_message` is set
   from the final failure if retries are exhausted.

## `webhook_events` table

See `docs/DATABASE.md` for the full column list. Key point repeated here because it's the
crux of this contract: `unique (provider, event_id)` is what makes step 4 above safe to
call from a handler that Zernio may call more than once for the same event (at-least-once
delivery, per Zernio's own docs).

## Testing

- Unit: signature verification (valid, invalid, missing secret configured, missing header),
  payload schema validation per event type.
- Integration: POST the same payload twice → one `webhook_events` row, one BullMQ job.
- Integration: POST with a bad signature → `401`, zero DB rows.
- Use Zernio's own `POST /v1/webhooks/test` sandbox endpoint for realistic payloads during
  manual verification; automated tests still use fixture payloads/mocks, never live Zernio
  calls (per `docs/TESTING.md`).
