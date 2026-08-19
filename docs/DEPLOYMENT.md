# Deployment Guide

Production is **Vercel + Supabase**, provisioned and running. This document describes the real
topology rather than the generic placeholder it replaced (which predated the actual hosting
decision and described "whatever the hosting target provides").

Scope discipline still applies per `docs/ADR/0005-simplified-mvp-architecture.md`: 3-4 users,
under 1,000 API calls/month. There is no Docker, no Nginx, no Cloudflare, no queue, and no
`apps/worker` deployment.

## Topology

```
                        Vercel project "web"          Vercel project "api"
  browser  ──TLS──►  apps/web (Next.js)  ──HTTPS──►  apps/api (NestJS)  ──►  Zernio REST
                       region bom1                     region bom1
                                                            │
                                                            ▼
                                              Supabase PostgreSQL (ap-south-1)
```

- **Two Vercel projects from one monorepo**, distinguished by Root Directory (`apps/web` and
  `apps/api`). They deploy independently from the same commit.
- **`apps/api` runs as a single serverless function.** `apps/api/api/index.ts` is the Vercel
  entrypoint; `apps/api/vercel.json` rewrites `/(.*)` to `/api` so Nest's own router handles every
  path inside one function. `src/main.ts` still exists and is still the entry for local
  development — the difference is only who owns the socket (see the comments in `api/index.ts`).
- **`apps/worker` is not deployed.** It remains an inert placeholder per ADR 0005.
- **Region colocation is a correctness-adjacent requirement, not a preference.** With functions in
  `iad1` and the database in Sydney, page loads ran 5-8 s. Both tiers and the database are now in
  Mumbai (`bom1` / `ap-south-1`). If either is ever moved, move all of them — see ADR 0006 for the
  measurements.

## Environment variables

Set per Vercel project, in the project's own Environment Variables settings. Names and purposes
are documented in `.env.example`; that file holds placeholders only and must never carry real
values.

**`apps/api` project**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** (port 6543, `?pgbouncer=true`). Runtime queries. Pooled because each cold serverless instance would otherwise open its own direct connection. |
| `DIRECT_URL` | Supabase session pooler / direct connection (port 5432). Prisma migrations and introspection only, never runtime. |
| `ZERNIO_API_KEY` | Server-side only. Never reaches `apps/web` or the browser. |
| `ZERNIO_WEBHOOK_SECRET` | HMAC-SHA256 verification of `X-Zernio-Signature` on inbound webhooks (Phase 11). |
| `API_INTERNAL_SECRET` | HS256 secret for the `apps/web` → `apps/api` bearer token. Must be **identical** in both projects. |
| `APP_URL` | `apps/api`'s own view of where `apps/web` lives, used to build the Zernio OAuth `redirect_url` server-side so a client-supplied redirect target is never trusted. Since Phase 17 it must also share an origin with `META_REDIRECT_URI`, or `MetaConnectionService` refuses to start a Meta connect. |
| `META_APP_ID` | Phase 17. The **Instagram** app id from App Dashboard > Instagram > API setup with Instagram login — *not* the Meta/Facebook app id on App Settings > Basic. Using the wrong one of the two fails as an opaque `Invalid redirect_uri`. |
| `META_APP_SECRET` | Phase 17. The Instagram app secret from the same panel. Also the HMAC key for the OAuth `state`, keeping that key to one cryptographic purpose. |
| `META_REDIRECT_URI` | Phase 17. `https://<apps/web domain>/instagram/meta/callback`. Must match the App Dashboard's *OAuth redirect URIs* entry **character for character, trailing slash included** — Meta's docs warn the dashboard may append one. The value in use is logged at API startup for exactly this reason. |
| `META_TOKEN_ENCRYPTION_KEY` | Phase 17. 32 bytes base64. Encrypts the stored Meta access token at rest (AES-256-GCM). **Per-environment**: production must have its own, and rotating it makes every stored token unreadable and forces every account to reconnect. |

**`apps/web` project**

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Auth.js session signing. Rotating it invalidates every existing session. |
| `API_INTERNAL_SECRET` | Must match the `apps/api` project exactly, or every API call 401s. |
| `NEXT_PUBLIC_API_URL` | Base URL of the deployed `apps/api` project. |
| `NEXT_PUBLIC_APP_URL` | Public base URL of `apps/web`. |
| `ADMIN_EMAIL` | Phase 15.1. The account with this address is promoted to the global `ADMIN` role on registration and re-promoted at each sign-in. **Only ever promotes, never demotes** — see `docs/SECURITY.md`. Not a credential; the holder still has to authenticate. Read by `apps/web` (which owns registration and sign-in), not `apps/api`. |
| `GOOGLE_CLIENT_ID` | Phase 15.5. OAuth 2.0 **Web application** client from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Phase 15.5. Its secret. |

Copy both Supabase connection strings verbatim from Supabase's "Connect" dialog — do not
hand-assemble them.

**Google sign-in is all-or-nothing.** Both `GOOGLE_*` variables must be set or the provider is
not registered and the button is hidden — Auth.js throws at import time on a provider missing
its credentials, which would break password sign-in too, so this fails closed deliberately
(`docs/ADR/0008-google-signin-and-session-lifetime.md`). The consequence worth knowing at
deploy time: **a missing variable presents as "the feature was never built", not as an error.**

Register these exact redirect URIs with the Google OAuth client:

```
http://localhost:3000/api/auth/callback/google
https://<your-web-domain>/api/auth/callback/google
```

> `.env.example` still lists `REDIS_URL`, `S3_*`, and `SENTRY_DSN` from the pre-ADR-0005 scope.
> No code reads them and they are not set in production. `REDIS_URL` and `S3_*` are now labelled
> as retired scope in that file; they should still eventually be removed outright.

## Database backups (GitHub Actions)

`.github/workflows/database-backup.yml` runs `pg_dump` against Supabase daily at 06:30 UTC
(12:00 IST) and uploads the gzipped dump to Google Drive via
`scripts/upload-backup-to-drive.mjs`. Repository secrets required: `SUPABASE_DATABASE_URL`,
`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`,
`GOOGLE_DRIVE_FOLDER_ID`.

### Why OAuth and not a service account

The obvious design — a service account with a JSON key — **cannot work on a personal Google
account**, and fails in a way that reads like a permissions problem:

```
403 storageQuotaExceeded
Service Accounts do not have storage quota. Leverage shared drives, or use OAuth delegation.
```

A service account is not a person and owns no Drive storage. A file it uploads would be *owned
by it*, and it has nowhere to put one. Google's documented answer is a **Shared Drive**, which
owns files at the drive level — but Shared Drives are a Google Workspace feature and simply do
not exist on a personal Gmail account.

So the uploader authenticates **as a real user** via an OAuth refresh token. Backups are owned by
that user and count against their own quota (15GB free), and no Shared Drive is involved.

Scope is `drive.file` — access limited to files this app itself created. It cannot read the rest
of that user's Drive even if the token leaked, and being a non-sensitive scope it needs no
Google verification review to publish.

### One-time setup

1. **Google Cloud Console → APIs & Services → Library → enable "Google Drive API"**.
2. **OAuth consent screen** → External. Add yourself as a test user.
3. **Credentials → Create credentials → OAuth client ID → Application type: Desktop app.**
   Note the client ID and secret.
4. Run the helper locally — it opens the consent screen, catches the redirect, and prints a
   refresh token:
   ```
   $env:GOOGLE_DRIVE_CLIENT_ID="...apps.googleusercontent.com"
   $env:GOOGLE_DRIVE_CLIENT_SECRET="..."
   scripts\pnpm.ps1 exec node scripts/get-google-drive-refresh-token.mjs
   ```
5. Add all three as repository secrets, plus `GOOGLE_DRIVE_FOLDER_ID`.
6. **Publish the OAuth consent screen** (OAuth consent screen → PUBLISH APP).

> **Step 6 is not optional.** While the consent screen is in "Testing", Google expires refresh
> tokens after **seven days**. The backup runs fine for a week, then fails with `invalid_grant` —
> which is a bad way to find out your backups stopped. Publishing needs no verification review,
> because `drive.file` is non-sensitive. The upload script names this explicitly if it ever sees
> that error.

These `GOOGLE_DRIVE_*` secrets are entirely separate from the `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` used for end-user sign-in in `apps/web` — different OAuth client,
different purpose. Do not reuse one for the other; the sign-in client needs web redirect URIs
this flow does not.

**Each dump is a full restore point, not a data-only export** — schema *and* data, scoped to
`--schema=public` (where all of this project's data lives; Supabase's managed schemas are not
ours to back up, and the connecting role cannot fully read them). The workflow's verify step
asserts the dump really contains the expected `CREATE TABLE` and `CREATE TYPE` statements, so a
dump that would restore into an empty database fails the run instead of reaching Drive.
**How to restore, and what a restore does not bring back:
[`docs/RUNBOOKS/restore-database.md`](RUNBOOKS/restore-database.md).**

**Retention: 90 days** (`BACKUP_RETENTION_DAYS` in the workflow; set `0` to keep everything).
Expired backups are moved to Drive's trash, not permanently deleted. Two properties make the
cleanup safe to leave unattended:

- It runs **only after a successful upload**, so a failed backup run can never delete an older
  good one.
- The **7 newest backups are always kept**, whatever their age — otherwise a workflow that had
  been broken for months would come back and delete its entire history in one pass, leaving a
  single minutes-old file.

Three things about this are easy to get wrong, and two of them are guarded in the workflow
itself rather than left to be discovered:

- **`SUPABASE_DATABASE_URL` must be the SESSION POOLER** — not the transaction pooler, and
  **not** the direct connection either. Both of the obvious choices are wrong, for two
  unrelated reasons, and the workflow now refuses each with the fix in the error message:

  | Connection | Host | Reachable from Actions? | Usable by `pg_dump`? |
  |---|---|---|---|
  | Direct | `db.<ref>.supabase.co:5432` | ❌ **IPv6-only**; GitHub runners have no IPv6 | ✅ |
  | **Session pooler** | `*.pooler.supabase.com:5432` | ✅ | ✅ **use this** |
  | Transaction pooler | `*.pooler.supabase.com:6543` | ✅ | ❌ no stable session |

  The direct host is the natural thing to reach for — it is what `DIRECT_URL` uses, and it is
  correct for `pg_dump` — but Supabase resolves it to IPv6 only on the free tier, and a
  GitHub-hosted runner cannot route there. It fails with `Network is unreachable` **before
  authentication is attempted**, which reads like a credentials or firewall problem and is
  neither. Vercel is unaffected because Vercel has IPv6.

  Copy the value from **Supabase dashboard → Connect → Session pooler**. Note the username
  carries the project ref (`postgres.<project-ref>`, not plain `postgres`), and the host prefix
  varies by project age (`aws-0-…` or `aws-1-…`), so copy it verbatim rather than assembling it.
- **The `pg_dump` client must be at least the server's major version.** Ubuntu's default
  `postgresql-client` trails Supabase, and `pg_dump` refuses a newer server outright rather than
  writing a partial file. The workflow installs `postgresql-client-17` from PGDG; bump that when
  Supabase's Postgres major version moves.
- **`GOOGLE_DRIVE_FOLDER_ID` must be a folder in the Drive of the account that authorised the
  refresh token.** Take the id from the folder URL
  (`drive.google.com/drive/folders/<THIS>`). If uploads are refused with a permission error
  rather than a quota one, the `drive.file` scope is the likely cause: it grants access only to
  files this app created, so a folder made by hand in the Drive UI can be off-limits. Leaving
  the id pointing at a folder this app created, or at the My Drive root, avoids that.

## Caching and freshness

`apps/web` caches its reads in the Vercel Data Cache with a 60-second TTL, invalidated by tag.
This has a user-visible consequence — dashboard figures can be up to a minute old — and a
deployment consequence: **the Sync button is the only mechanism that forces fresh data**, so any
new mutating server action must invalidate the tags it affects or users will keep seeing stale
numbers. See `docs/ADR/0006-response-caching-and-freshness.md`.

Note that the Data Cache **survives a deployment**. Cache entry shapes are therefore versioned in
the key (`['callApiCached', 'v2', path]` in `apps/web/src/lib/api.ts`); changing what is stored
without bumping that version would have the first request after a deploy read the old shape.

## Release process

1. CI green on `main` — `scripts/lint.ps1` (eslint + typecheck + prettier) and `scripts/test.ps1`.
2. **Run Prisma migrations against the target database as an explicit, reviewed step**, using
   `DIRECT_URL`. Never auto-applied by app startup.
3. Deploy the `apps/api` project. Confirm `/api/health` (no DB) and `/api/ready` (SELECT 1).
4. Deploy the `apps/web` project.

Order matters only when a release changes the API contract: `apps/web` calls `apps/api` on every
render, so deploying web first against an older API is the failure case to avoid.

### Phase 17 release (the `platform_post_id` pivot) — a special case

This release is **not** a single migrate-then-deploy step, because its second migration drops a
column the currently-deployed code still writes. Running the two migrations back to back and then
deploying would break automation writes in between.

Migration A is deliberately backward-compatible so the **old** code keeps working after it: it
only adds `platform_post_id` (nullable) and `meta_connections`, and relaxes `zernio_post_id` to
nullable. That is what makes a no-downtime order possible:

1. Apply **migration A** (`20260819154500_phase17_meta_connection_and_platform_post_id`) using
   `DIRECT_URL`. The running production code is unaffected.
2. Run the backfill against production — it reads `platformPostId` off Zernio's own
   comment-automations list, so it does **not** depend on Zernio having synced the post:
   `scripts/pnpm.ps1 --filter "@automationdm/database" exec node dev/phase17-backfill-platform-post-id.mjs`
   It needs `DATABASE_URL` pointing at production and `ZERNIO_API_KEY`. It exits non-zero and
   names every row it could not resolve rather than leaving a surprise for step 4.
3. Verify with `dev/phase17-backfill-check.mjs` — it must report `missingPlatformPostId: 0`.
4. Deploy `apps/api`, then `apps/web`. The new code writes `platform_post_id` and ignores the
   still-present `zernio_post_id`.
5. Apply **migration B** (`20260819163000_phase17_drop_zernio_post_id`), which drops
   `zernio_post_id` and makes `platform_post_id` required. Destructive and not reversible;
   Vercel's deployment rollback does not cover it.

Doing step 5 before step 4 leaves the old code writing a column that no longer exists. Doing
step 4 before steps 1-3 leaves the new code querying a column that does not exist yet. Neither
is recoverable by rolling back the deployment alone.

**The local database proves nothing here** — it had zero automation rows when both migrations
were applied, so migration B succeeded trivially. Production has real automations, and step 5's
`SET NOT NULL` will fail on any row the backfill missed. That failure is the safety net working.

## Rollback

Vercel keeps previous deployments; promoting an earlier one is the rollback path for either app.
Database migrations are **not** covered by that — a migration that drops or rewrites data has no
automatic inverse, which is why step 2 is explicit and reviewed rather than automatic.

## Keep-alive (Supabase free-tier pausing)

Supabase's free tier pauses a project after 7 days with no database activity.
`.github/workflows/keep-alive.yml` pings `apps/api`'s `/ready` endpoint (which runs `SELECT 1`
via Prisma) once a day to prevent that. It reads the deployed `apps/api` URL from the
repository variable `API_READY_URL` (Settings -> Secrets and variables -> Actions -> Variables
tab - a plain variable, not a secret, since it's just a public URL) set to
`https://<your-api-project>.vercel.app/ready`. Not needed once/if the Supabase project is on a
paid plan, since paid projects are never auto-paused.

## What this document still does not cover

Custom DNS records, a backup/restore procedure, and an incident runbook. Deferred to
`docs/RUNBOOKS/`. Secret management is currently "Vercel project environment variables and
nothing else", which is adequate at this scale but is not a rotation procedure.
