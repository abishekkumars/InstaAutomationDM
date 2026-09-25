// Applies pending Prisma migrations as part of the apps/api PRODUCTION build on Vercel - see
// docs/ADR/0011-automatic-migrations-on-production-deploy.md.
//
// Usage (appended to the api project's existing Build Command in the Vercel dashboard, so the
// database is only touched once the API has compiled):
//   <existing build command> && pnpm --filter @automationdm/database run migrate:vercel
//
// What it does:
//   - Anything other than a production build (preview deployments, which Vercel builds for every
//     branch push, and local runs) exits 0 without touching a database.
//   - Reads which migrations the target database has already applied (`_prisma_migrations`).
//   - If any pending migration contains a destructive statement (migration-guard.mjs), it applies
//     NOTHING and exits 1, failing the build. The previous deployment stays live. Apply that
//     migration by hand, following its own instructions, then redeploy.
//   - If a previous migration is recorded as failed, it exits 1 as well: that needs a person.
//   - Otherwise it runs `prisma migrate deploy`, and exits with its status. A failed migration
//     therefore also fails the build, before the new code goes live.
//
// Flags:
//   --check   report what would happen and exit, without migrating. Works anywhere, including
//             locally against any DATABASE_URL/DIRECT_URL, so the guard can be tried safely.
//
// Uses DIRECT_URL when set (Supabase's session pooler / direct connection): migrations cannot run
// through the transaction pooler that DATABASE_URL points at in production.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findDestructiveStatements,
  listMigrationNames,
  readMigrationSql,
} from './migration-guard.mjs';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(packageDir, 'prisma', 'migrations');
const checkOnly = process.argv.includes('--check');

/** Runs the pnpm-installed Prisma CLI. `shell: true` resolves its shim on both Windows and
 * Vercel's Linux; the command is one fixed string (never user input), which is also how Node
 * wants a shell command passed. */
function prisma(command) {
  return (
    spawnSync(`prisma ${command}`, { cwd: packageDir, stdio: 'inherit', shell: true }).status ?? 1
  );
}

const vercelEnv = process.env.VERCEL_ENV;
if (!checkOnly && vercelEnv !== 'production') {
  console.log(
    `[migrate] Skipped: VERCEL_ENV is "${vercelEnv ?? 'unset'}", not "production". ` +
      'Only the production build migrates the database.',
  );
  process.exit(0);
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] Neither DIRECT_URL nor DATABASE_URL is set; cannot migrate.');
  process.exit(1);
}

// The generated client is only needed for one raw query below. Generating first keeps this
// script independent of whatever the rest of the build command does, and in what order.
if (prisma('generate') !== 0) {
  console.error('[migrate] prisma generate failed.');
  process.exit(1);
}
const { PrismaClient } = await import('@prisma/client');
const client = new PrismaClient({ datasourceUrl: url });

let rows = [];
try {
  rows = await client.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
} catch (error) {
  // 42P01: the table does not exist yet - a brand-new database, where everything is pending.
  if (error?.meta?.code !== '42P01' && !String(error?.message).includes('42P01')) {
    console.error('[migrate] Could not read _prisma_migrations:', error);
    await client.$disconnect();
    process.exit(1);
  }
} finally {
  await client.$disconnect();
}

const failed = rows.filter((row) => !row.finished_at && !row.rolled_back_at);
if (failed.length > 0) {
  console.error(
    `[migrate] BLOCKED: a previous migration is recorded as failed: ${failed
      .map((row) => row.migration_name)
      .join(', ')}.\nResolve it by hand (prisma migrate resolve) before deploying again.`,
  );
  process.exit(1);
}

const applied = new Set(
  rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name),
);
const pending = listMigrationNames(migrationsDir).filter((name) => !applied.has(name));

if (pending.length === 0) {
  console.log('[migrate] Database is up to date. Nothing to apply.');
  process.exit(0);
}

const dangerous = pending
  .map((name) => ({
    name,
    found: findDestructiveStatements(readMigrationSql(migrationsDir, name)),
  }))
  .filter(({ found }) => found.length > 0);

console.log(`[migrate] Pending: ${pending.join(', ')}`);

if (dangerous.length > 0) {
  console.error('\n[migrate] BLOCKED: these pending migrations are destructive:');
  for (const { name, found } of dangerous) {
    console.error(`  ${name}  (${found.join(', ')})`);
  }
  console.error(
    '\nNothing was applied. Apply them by hand, following the instructions in each ' +
      'migration.sql and docs/DEPLOYMENT.md, then redeploy. Safe migrations queued with them ' +
      'wait too, so the order in the migrations folder is always kept.',
  );
  process.exit(1);
}

if (checkOnly) {
  console.log('[migrate] --check: all pending migrations are safe to auto-apply. Not applying.');
  process.exit(0);
}

console.log('[migrate] All pending migrations are additive. Applying...');
process.exit(prisma('migrate deploy'));
