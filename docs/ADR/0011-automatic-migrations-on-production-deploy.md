# ADR 0011 — Automatic migrations on production deploy, with a destructive-migration guard

- **Status:** Accepted (2026-09-25), at the user's request.
- **Supersedes:** the "never auto-applied" rule in `docs/DEPLOYMENT.md`'s release process, step 2.

## Context

Until now every production migration was a manual step: someone ran `prisma migrate deploy`
against Supabase before deploying. That rule existed for a good reason. Phase 17's migration B
drops a column and had to wait for a backfill and a code deploy, and an automatic run would have
applied it too early.

In practice the manual step drifted. When Phase 19 was released, production's
`_prisma_migrations` table listed four migrations as pending whose changes were already in the
schema, most likely applied with `prisma db push`. Nobody had noticed, because nothing checked.
And a new table, the common case, needs no human judgement at all.

## Decision

1. **The `apps/api` production build applies pending migrations.** The Vercel project's Build
   Command runs `pnpm --filter @automationdm/database run migrate:vercel` as its last step, after
   the API has compiled (`packages/database/deploy/migrate-on-deploy.mjs`). Vercel promotes a
   deployment only when the whole command succeeds, so the new code still never goes live against
   a schema that failed to migrate.
2. **Only production.** The script does nothing unless `VERCEL_ENV` is `production`. Vercel builds
   a preview deployment for every branch push, and a preview must never change the production
   database.
3. **Destructive migrations are never auto-applied.** Before migrating, the script reads every
   pending migration's SQL, ignoring comments. If one contains `DROP TABLE`, `DROP COLUMN`,
   `DROP TYPE`, `DROP SCHEMA`, `TRUNCATE`, `DELETE FROM`, `SET NOT NULL`, a column type change, or
   `RENAME`, it applies nothing and fails the build. Safe migrations queued behind it wait too, so
   the folder's order is always kept. A person applies that migration by hand, following its own
   instructions, and redeploys.
4. **Any failure fails the build.** That covers a blocked migration, a previously failed migration
   in `_prisma_migrations`, or `migrate deploy` itself failing. Vercel then keeps the previous
   deployment live, and the new API code never runs against a schema it does not expect.
5. **`DIRECT_URL` is used**, because migrations cannot run through the transaction pooler that
   `DATABASE_URL` points at in production.

## Consequences

- Additive migrations, which are nearly all of them, now reach production with the code that
  needs them, in the right order, with no step to forget.
- The guard is a keyword check, not a SQL parser. A false positive costs one manual apply. A false
  negative would need a destructive statement it does not list; the list is unit tested against
  every migration in the repo, and exactly Phase 17's migration B is flagged.
- `apps/web` still deploys independently from the same commit. The old risk, web going live against
  an API that has not deployed yet, is unchanged by this ADR.
- `prisma db push` against production is now actively harmful. It changes the schema without
  recording the change, so the next deploy tries to apply the recorded migration again and fails.
  Use migrations only.
- Rollback: remove the `migrate:vercel` step from the Build Command. Nothing else depends on it.
