# ADR 0001: Modular monolith, not microservices, at project start

## Status
Accepted

## Context
The product vision (master prompt section 1) covers a large eventual surface area:
automations, contacts, conversations, analytics, billing. It would be easy to justify
separate services per domain from day one. The master prompt explicitly forbids this
(sections 2.22-2.24): "Do not introduce microservices prematurely," "Start as a modular
monolith with separate workers," "Keep boundaries clean enough that services can later be
separated."

## Decision
Three deployable units: `apps/web` (Next.js), `apps/api` (NestJS, one process, many
modules), `apps/worker` (BullMQ consumers). Business domains are NestJS modules within
`apps/api`, and framework-independent logic (automation engine, Zernio adapter) lives in
standalone `packages/*` so it doesn't depend on NestJS's DI container — this is what keeps
the door open to extracting a package into its own service later without a rewrite.

## Consequences
- Simpler deployment and operations while the team/user is one person and the product is
  pre-PMF.
- Module boundaries (NestJS module folders + separate `packages/*`) must be respected in
  code review even though nothing *forces* the boundary at runtime the way a network call
  would — this is a discipline cost, not a free lunch.
- If/when a specific module (e.g. `automation-engine` or `webhooks`) needs independent
  scaling or deployment cadence, it can be pulled into its own service because it's already
  isolated as a package with an explicit interface, not tangled through `apps/api`'s
  internals.

## Alternatives considered
- Microservices from day one — rejected per explicit master-spec constraint and because the
  operational overhead (service discovery, distributed tracing, N deployment pipelines) is
  unjustified before there's real traffic or a real multi-person team.
