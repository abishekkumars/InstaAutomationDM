# packages/automation-engine

Not yet scaffolded. Per [docs/ADR/0005-simplified-mvp-architecture.md](../../docs/ADR/0005-simplified-mvp-architecture.md),
this is **not** a generic trigger/condition/action engine — the automation shape is one
fixed thing (one post/reel + keyword + public reply + DM). Whether this package ends up
holding real matching logic, or barely anything (if Zernio's own API does the matching
server-side), is an open question — see [docs/AUTOMATION-ENGINE.md](../../docs/AUTOMATION-ENGINE.md).
