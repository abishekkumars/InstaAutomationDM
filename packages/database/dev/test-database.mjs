// Keeps the test suites off the development database.
//
// Both packages/database and apps/api run integration tests that `deleteMany()` every user,
// organization, membership, Instagram account and automation in `beforeEach`. Pointed at the
// developer's own DATABASE_URL, one `scripts/test.ps1` run wiped their local data, including a
// connected Instagram account - it happened in Phase 17 and again in Phase 18.1. So tests now run
// against a separate database, and refuse to start against anything that is not clearly one.
//
// Which database the tests use:
//   1. TEST_DATABASE_URL, if set.
//   2. Otherwise, when DATABASE_URL points at this machine (localhost / 127.0.0.1), the same
//      server with `_test` appended to the database name: `.../automationdm` becomes
//      `.../automationdm_test`. A name that already ends in `_test` is used as is (CI does this).
//   3. Otherwise - DATABASE_URL points at a remote server, e.g. Supabase - no default at all:
//      tests fail with a message instead of guessing a database on someone else's server.
// Whatever is chosen, the database name must end in `_test`, or the tests refuse to run.
//
// Used from two places:
//   - the vitest setup files, via useTestDatabase(), before any PrismaClient is constructed;
//   - `node dev/test-database.mjs prepare` (scripts/test.ps1 runs it first), which creates the
//     test database if it is missing and applies every migration to it.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_SUFFIX = '_test';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function databaseName(url) {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

/** Returns the test database URL for this environment, or null when none can be chosen safely. */
export function resolveTestDatabaseUrl(env) {
  if (env.TEST_DATABASE_URL) {
    return env.TEST_DATABASE_URL;
  }
  if (!env.DATABASE_URL) {
    return null;
  }
  const url = new URL(env.DATABASE_URL);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return null;
  }
  const name = databaseName(url);
  if (!name.endsWith(TEST_SUFFIX)) {
    url.pathname = `/${encodeURIComponent(name + TEST_SUFFIX)}`;
  }
  return url.toString();
}

/** Throws unless `rawUrl` names a database whose name ends in `_test`. */
export function assertTestDatabaseUrl(rawUrl) {
  const name = databaseName(new URL(rawUrl));
  if (!name.endsWith(TEST_SUFFIX)) {
    throw new Error(
      `Refusing to run tests against database "${name}": the test suites delete every row in ` +
        `beforeEach, so the database name must end in "${TEST_SUFFIX}". Set TEST_DATABASE_URL ` +
        'to a dedicated test database (see docs/TESTING.md).',
    );
  }
}

/** Points DATABASE_URL and DIRECT_URL at the test database. Call before anything imports Prisma. */
export function useTestDatabase(env = process.env) {
  const testUrl = resolveTestDatabaseUrl(env);
  if (!testUrl) {
    throw new Error(
      'No test database configured. DATABASE_URL is not on localhost, so there is no safe ' +
        'default: set TEST_DATABASE_URL to a dedicated database whose name ends in ' +
        `"${TEST_SUFFIX}" (see docs/TESTING.md).`,
    );
  }
  assertTestDatabaseUrl(testUrl);
  env.DATABASE_URL = testUrl;
  env.DIRECT_URL = testUrl;
  return testUrl;
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A direct path rather than module resolution, for the same reason local-db.mjs uses one: it
// relies only on pnpm's node_modules/<pkg> symlink for a direct dependency.
const PRISMA_CLI = path.join(PACKAGE_ROOT, 'node_modules', 'prisma', 'build', 'index.js');

function prisma(args, { env, input }) {
  return spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: PACKAGE_ROOT,
    env,
    input,
    encoding: 'utf-8',
  });
}

/** Creates the test database if needed, then applies all migrations to it. */
function prepare() {
  const env = { ...process.env };
  const testUrl = useTestDatabase(env);
  const url = new URL(testUrl);
  const name = databaseName(url);

  // CREATE DATABASE has to run while connected to a different database; `postgres` always
  // exists on a stock server. The name is double-quoted as an identifier, with any embedded
  // quote doubled, so it cannot break out of the statement.
  const maintenance = new URL(testUrl);
  maintenance.pathname = '/postgres';
  const created = prisma(['db', 'execute', '--stdin', '--url', maintenance.toString()], {
    env,
    input: `CREATE DATABASE "${name.replace(/"/g, '""')}"`,
  });
  const createOutput = `${created.stdout}\n${created.stderr}`;
  if (created.status === 0) {
    console.log(`[test-db] Created database "${name}".`);
  } else if (/already exists/i.test(createOutput)) {
    console.log(`[test-db] Database "${name}" already exists.`);
  } else {
    throw new Error(`Could not create test database "${name}":\n${createOutput.trim()}`);
  }

  const migrated = prisma(['migrate', 'deploy'], { env });
  if (migrated.status !== 0) {
    throw new Error(
      `prisma migrate deploy failed for "${name}":\n${migrated.stdout}\n${migrated.stderr}`,
    );
  }
  console.log(`[test-db] Migrations applied to "${name}" on ${url.host}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command !== 'prepare') {
    console.error('Usage: node dev/test-database.mjs prepare');
    process.exit(1);
  }
  try {
    prepare();
  } catch (error) {
    console.error('[test-db] Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
