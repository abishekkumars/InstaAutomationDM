# Runbooks

Operational runbooks (incident response, on-call procedures, deployment rollback). Populated
starting Phase 13 (Security hardening) / Phase 14 (Production deployment) — see
`docs/IMPLEMENTATION-ROADMAP.md`.

| Runbook | Covers |
|---|---|
| [`restore-database.md`](restore-database.md) | What the daily Supabase backup contains, how long backups are kept, and how to restore one — including what a restore does **not** bring back (Zernio holds the automations that actually run). |

Deployment, rollback and the backup workflow's own configuration live in
`docs/DEPLOYMENT.md` rather than here.
