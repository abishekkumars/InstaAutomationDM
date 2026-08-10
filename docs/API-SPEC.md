# API Specification

Status: Phase 0 placeholder. No `apps/api` endpoints exist yet (Phase 3 scaffolds the
NestJS app; individual endpoints land with the phase that needs them: auth in Phase 5,
instagram-accounts in Phase 7/9, webhooks in Phase 10, automations in Phase 12/13, etc.).

## Convention (applies once endpoints exist)

- REST, JSON bodies, resources scoped under the caller's organization implicitly (never a
  client-supplied `organizationId` in the path/body for tenant-owned resources — see
  `docs/DATABASE.md`/`docs/SECURITY.md`).
- Versioned under `/v1` if/when a breaking change is ever needed; unversioned for the MVP
  since there are no external API consumers yet.
- Errors: consistent `{ error: { code, message, requestId } }` shape, no stack traces in
  production responses (see `docs/SECURITY.md`).
- `GET /health` and `GET /ready` from the start of `apps/api` existing (Phase 3), per the
  observability requirement in the master spec — liveness vs. "ready to serve traffic"
  (DB/Redis reachable) are distinct checks.

## Endpoint inventory

Populated incrementally as each is actually implemented, with full request/response shape,
auth requirement, and example — not speculatively written ahead of the NestJS controller
that implements it, to avoid this document drifting from reality. Track "next endpoint to
document" via `docs/IMPLEMENTATION-ROADMAP.md`.
