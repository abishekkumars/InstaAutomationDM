# processors

Empty on purpose, and expected to stay that way. This project has no queue infrastructure —
see [docs/ADR/0005-simplified-mvp-architecture.md](../../../../docs/ADR/0005-simplified-mvp-architecture.md).
`apps/worker` itself is kept only as an inert placeholder; nothing is planned to land here
unless a concrete future requirement makes a background worker process actually necessary.
