# processors

Empty on purpose. BullMQ processors/consumers land here starting Phase 11 (Redis + BullMQ),
one module per queue defined in [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md):
`webhook-processing`, `automation-execution`, `dm-sending`, `follow-up`, `analytics`,
`notifications`. Each processor will be registered from `src/main.ts` once BullMQ workers
are wired up — no queue connection exists yet in this Phase 2 bootstrap shell.
