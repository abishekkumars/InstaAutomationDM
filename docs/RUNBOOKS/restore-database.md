# Runbook — Restore the database from a backup

Covers the backups produced by `.github/workflows/database-backup.yml` and uploaded to Google
Drive by `scripts/upload-backup-to-drive.mjs`.

## What the backup actually is

**A full restore point — schema *and* data.** `pg_dump` runs with neither `--data-only` nor
`--schema-only`, so each `postgres_<timestamp>.sql.gz` contains:

- `CREATE TABLE` for every table in `public` (`users`, `organizations`,
  `organization_members`, `instagram_accounts`, `automations`)
- `CREATE TYPE` for every enum (`UserRole`, `OrganizationRole`, `InstagramAccountStatus`,
  `AutomationMatchMode`, `AutomationAudience`)
- indexes, unique constraints and foreign keys
- every row, as `COPY` data

Restoring it into an empty database gives back a working application. The workflow asserts this
on every run rather than assuming it: the "Verify backup" step fails if the dump is missing any
of those `CREATE TABLE` statements or any `CREATE TYPE`, so a dump that would silently restore
into an empty database never reaches Drive.

**What it deliberately does not contain:**

| Not included | Why it does not matter here |
|---|---|
| Database **roles**/users | Cluster-level; `pg_dump` never includes them. `--no-owner --no-privileges` makes the restore role-agnostic, so it does not need them. |
| Supabase's managed schemas (`auth`, `storage`, `realtime`) | The dump is scoped `--schema=public`. This project uses Auth.js against its own `users` table, not Supabase Auth — **all** application data is in `public`. |
| Ownership and `GRANT`s | Stripped on purpose. Objects end up owned by whoever runs the restore. |
| Anything outside Postgres | Zernio holds the automations it executes; Instagram holds the posts. See "What a restore does not bring back" below. |

## Retention

Backups are kept for **90 days** (`BACKUP_RETENTION_DAYS` in the workflow), after which the
cleanup pass moves them to Drive's trash. Two safety properties are worth knowing:

- Cleanup runs **only after a successful upload**, so a run that could not produce a new backup
  never deletes an old one.
- The **7 newest backups are always kept**, whatever their age. If the workflow breaks for
  months and then succeeds once, you still keep the history rather than being left with a single
  minutes-old file.

Files are trashed, not permanently deleted, so a mistake is recoverable for as long as Drive
retains trashed items.

## Restoring

### 1. Get the backup

Download the `postgres_<timestamp>.sql.gz` you want from the Drive folder, then:

```bash
gunzip -k postgres_2026-08-15_06-30-00.sql.gz
```

Check it looks right before restoring anything:

```bash
head -40 postgres_2026-08-15_06-30-00.sql
```

### 2. Decide where it goes

**Never restore over a live database to "see if it works".** Restore into a scratch target
first — a local database, or a fresh Supabase project. The local embedded Postgres is ideal:

```bash
.\scripts\db.ps1 start
```

### 3. Restore

The dump is plain SQL, so `psql` applies it. Against local dev:

```bash
psql "postgresql://automationdm:automationdm@localhost:5432/automationdm" --set ON_ERROR_STOP=on -f postgres_2026-08-15_06-30-00.sql
```

`ON_ERROR_STOP=on` matters. Without it `psql` continues past failures and reports success at the
end, leaving a half-restored database that looks fine.

The target's `public` schema must be empty, or `CREATE TABLE` collides with what is already
there. To reset a local database first:

```bash
.\scripts\pnpm.ps1 --filter @automationdm/database run migrate:reset
```

then drop the tables Prisma just created, or restore into a freshly created empty database
instead.

### 4. Verify before trusting it

Point `DATABASE_URL`/`DIRECT_URL` at the restored database and check that the data is really
there, not just the tables:

```bash
.\scripts\pnpm.ps1 exec node -e "const{prisma}=require('./packages/database/dist/index.js');(async()=>{console.log('users',await prisma.user.count());console.log('orgs',await prisma.organization.count());console.log('accounts',await prisma.instagramAccount.count());console.log('automations',await prisma.automation.count());await prisma.$disconnect()})()"
```

Then run the app against it and sign in.

### 5. Restoring to production

Only after the above succeeded against a scratch target.

1. **Take a fresh backup of the current production database first**, even if it is the thing you
   believe is broken. Run the workflow manually (`workflow_dispatch`). A restore replaces state;
   without this you cannot get back to where you started.
2. Use the **direct connection (port 5432)** — the same value as `DIRECT_URL`, never the
   transaction pooler on 6543. `psql` restoring a schema needs a stable session, exactly as
   `pg_dump` does.
3. Restore, then run `migrate:deploy` to confirm the schema is at the migration HEAD the code
   expects:
   ```bash
   .\scripts\pnpm.ps1 --filter @automationdm/database run migrate:deploy
   ```
   If the backup predates a migration, this applies the missing ones. If it is *newer* than the
   deployed code, stop — restore a different backup or deploy the matching code first.
4. Redeploy or purge caches. `apps/web` caches its reads for 60s by tag
   (`docs/ADR/0006-response-caching-and-freshness.md`), so the first loads after a restore may
   show pre-restore values.

## What a restore does not bring back

The database is **not** the whole system, and this is the part most likely to surprise you.

- **Zernio holds the automations that actually run.** The `automations` table mirrors Zernio's
  server-side configuration; Zernio executes the matching, replies and DMs
  (`docs/AUTOMATION-ENGINE.md`). Restoring an old database does not delete automations created
  since, nor recreate ones deleted from Zernio. After a restore the two can disagree — the
  dashboard reconciles from Zernio on read (`listForPost` backfills missing local rows), so
  press **Sync** and check the automations list against Zernio's own dashboard.
- **Instagram connections live with Zernio too.** `instagram_accounts` stores only Zernio's
  account id. If the restored row points at a connection that no longer exists, reconnect.
- **Sessions survive independently.** Auth.js sessions are JWTs signed with `AUTH_SECRET`, not
  database rows. Restoring to a point before a user existed leaves them with a valid cookie for
  a `sub` that is now absent — `SessionGuard` returns 401 and the app shows the session-expired
  dialog. Signing in again fixes it.

## If the backup workflow itself is failing

The three failure modes it guards against explicitly, with the fix for each, are documented in
`docs/DEPLOYMENT.md`'s "Database backups" section: the transaction pooler being used instead of
the direct connection, a `pg_dump` client older than the server, and the service account having
no Drive storage quota outside a Shared Drive.
