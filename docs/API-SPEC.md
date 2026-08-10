# API Specification

Status: Phase 4 — `apps/api` has `GET /api/health` (liveness) and `GET /api/ready`
(readiness, checks the database) plus the error/request-id foundation every future endpoint
sits on. Business endpoints land with the phase that needs them: auth in Phase 5,
instagram-accounts in Phase 7/9, webhooks in Phase 10, automations in Phase 12/13, etc.

## Convention

- All routes are served under the global prefix `/api` (set in `apps/api/src/main.ts` via
  `app.setGlobalPrefix('api')`).
- REST, JSON bodies, resources scoped under the caller's organization implicitly (never a
  client-supplied `organizationId` in the path/body for tenant-owned resources — see
  `docs/DATABASE.md`/`docs/SECURITY.md`).
- Versioned under `/api/v1` if/when a breaking change is ever needed; unversioned for the
  MVP since there are no external API consumers yet.
- Errors: every unhandled/thrown exception is caught by
  `apps/api/src/common/filters/all-exceptions.filter.ts` and returned as
  `{ error: { code, message, requestId } }` — `code` is the exception class name for
  `HttpException`s (`NotFoundException`, `BadRequestException`, ...) or
  `InternalServerError` otherwise; `message` is generic ("Internal server error") for
  non-`HttpException`s so internals never leak (see `docs/SECURITY.md`); full detail is
  logged server-side against the same `requestId`.
- Every request gets an `X-Request-Id` response header — either echoed back from an
  inbound `X-Request-Id` header, or generated (`crypto.randomUUID()`) by
  `apps/api/src/common/middleware/request-id.middleware.ts`. This is the correlation id
  used in server logs and in every error response body.
- `GET /api/ready` checks the database (Phase 4). Redis readiness is added to the same
  endpoint once Phase 11 gives it something real to check too — not before.

## Endpoint inventory

### `GET /api/health`

Liveness check. No auth. Always `200` if the process is up.

Response:
```json
{
  "status": "ok",
  "service": "api",
  "timestamp": "2026-08-10T15:31:46.908Z",
  "uptimeSeconds": 13
}
```

### `GET /api/ready`

Readiness check. No auth. `200` if the database is reachable, `503` (standard error shape)
otherwise.

Response (`200`):
```json
{
  "status": "ready",
  "service": "api",
  "timestamp": "2026-08-10T17:27:49.662Z"
}
```

Response (`503`, database unreachable):
```json
{
  "error": {
    "code": "ServiceUnavailableException",
    "message": "Database unreachable",
    "requestId": "bed45b6f-d6ee-4ed6-b1c7-63e088fb8c21"
  }
}
```

### Error shape example

`GET /api/does-not-exist` → `404`:
```json
{
  "error": {
    "code": "NotFoundException",
    "message": "Cannot GET /api/does-not-exist",
    "requestId": "5f1da08d-94a9-4d30-9787-61dad753b047"
  }
}
```

Further endpoints are documented here as each is actually implemented, with full request/
response shape, auth requirement, and example — not speculatively written ahead of the
NestJS controller that implements it, to avoid this document drifting from reality. Track
"next endpoint to document" via `docs/IMPLEMENTATION-ROADMAP.md`.
