# packages/zernio

`InstagramProvider` abstraction and the `ZernioInstagramProvider` implementation. Owns all
direct calls to the Zernio API/SDK so `apps/api` never talks to Zernio directly — see
[docs/ZERNIO-INTEGRATION.md](../../docs/ZERNIO-INTEGRATION.md).

Builds to `dist/` via `tsc` (`module: commonjs`), the same pattern `packages/database`/
`packages/shared`/`packages/validation` use.

## Status (Phase 7)

Skeleton only — the `InstagramProvider` interface exists (`connectAccount`) but
`ZernioInstagramProvider`'s implementation throws "not implemented yet" for everything. No
method makes a real HTTP call. Real implementations land starting Phase 8 (account
connection), each verified against Zernio's current docs at implementation time — never
invented ahead of that, per `CLAUDE.md`.
