// Lifecycle for the local, project-local PostgreSQL server used for development on this
// no-admin, no-Docker Windows machine. See docs/ADR/0003-local-postgresql-strategy.md for
// why this exists and how it was chosen.
//
// Deliberately uses `pg_ctl` directly (the same official Postgres server-control binary
// EnterpriseDB's own portable zip distribution uses) rather than the `embedded-postgres`
// npm package's own start()/stop() API: that API tracks the running server via an in-memory
// child_process handle on the JS object that called start(), so it only works within a
// single process's lifetime (e.g. a test runner's global setup/teardown) - it cannot stop a
// server that a *different*, earlier CLI invocation started. `embedded-postgres` is still
// used as the *distribution mechanism* for the actual Postgres binaries (downloaded via a
// normal `pnpm install`, matching how this repo already handles the Node runtime itself),
// just not for the start/stop calls themselves. `pg_ctl` reads/writes the data directory's
// own `postmaster.pid`, so start/status/stop correctly work across separate invocations.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');

const DATA_DIR = path.join(REPO_ROOT, '.tools', 'postgres-data');
const LOG_FILE = path.join(REPO_ROOT, '.tools', 'postgres-data.log');
const PORT = Number(process.env.LOCAL_DB_PORT ?? 5432);
const USER = 'automationdm';
const PASSWORD = 'automationdm';

const PLATFORM_PACKAGES = {
  'win32-x64': '@embedded-postgres/windows-x64',
  'darwin-x64': '@embedded-postgres/darwin-x64',
  'darwin-arm64': '@embedded-postgres/darwin-arm64',
  'linux-x64': '@embedded-postgres/linux-x64',
  'linux-arm64': '@embedded-postgres/linux-arm64',
};

function resolveBinDir() {
  const key = `${process.platform}-${process.arch}`;
  const pkg = PLATFORM_PACKAGES[key];
  if (!pkg) {
    throw new Error(
      `No known embedded-postgres binary package for platform "${key}". ` +
        'This local-db workflow has only been verified on win32-x64 - see the ADR.',
    );
  }
  // Deliberately a direct filesystem path, not module resolution (require.resolve /
  // import.meta.resolve): this package's own "exports" map doesn't expose its
  // package.json or the native/ directory as resolvable subpaths, only pnpm's
  // guaranteed node_modules/<pkg> symlink layout for a direct devDependency.
  const binDir = path.join(PACKAGE_ROOT, 'node_modules', ...pkg.split('/'), 'native', 'bin');
  if (!fs.existsSync(binDir)) {
    throw new Error(
      `Expected embedded-postgres binaries at ${binDir} but found nothing. Run ` +
        '"pnpm install" (via scripts/pnpm.ps1) in packages/database first.',
    );
  }
  return binDir;
}

function bin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return path.join(resolveBinDir(), exe);
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf-8' });
}

// `pg_ctl start` spawns postgres.exe as a long-lived grandchild. On Windows that grandchild
// (and its own background worker processes) can inherit pg_ctl's stdout/stderr pipe
// handles, so Node's spawnSync - which waits for those pipes to close, not just for pg_ctl
// itself to exit - hangs forever even after the server is fully up and pg_ctl has exited.
// `-l LOG_FILE` already redirects the server's own output to a file, so nothing is lost by
// not piping this call's stdio at all.
function runDetachedStart(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'ignore' });
}

function isInitialised() {
  return fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
}

function initialise() {
  console.log(`[db] Initializing local PostgreSQL data directory at ${DATA_DIR} ...`);
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  const passwordFile = path.join(REPO_ROOT, '.tools', '.pg-init-password');
  fs.writeFileSync(passwordFile, `${PASSWORD}\n`);
  try {
    const result = run(bin('initdb'), [
      `--pgdata=${DATA_DIR}`,
      '--auth=password',
      `--username=${USER}`,
      `--pwfile=${passwordFile}`,
    ]);
    if (result.status !== 0) {
      throw new Error(`initdb failed:\n${result.stdout}\n${result.stderr}`);
    }
    console.log('[db] Data directory initialized.');
  } finally {
    fs.rmSync(passwordFile, { force: true });
  }
}

function status() {
  const result = run(bin('pg_ctl'), ['status', '-D', DATA_DIR]);
  console.log((result.stdout || result.stderr || '').trim());
  return result.status === 0;
}

function start() {
  if (!isInitialised()) {
    initialise();
  }
  if (status()) {
    console.log('[db] Already running.');
    return;
  }
  console.log(`[db] Starting local PostgreSQL on port ${PORT} ...`);
  const result = runDetachedStart(bin('pg_ctl'), [
    'start',
    '-D',
    DATA_DIR,
    '-l',
    LOG_FILE,
    '-o',
    `-p ${PORT}`,
    '-w',
  ]);
  if (result.status !== 0) {
    throw new Error(
      `pg_ctl start failed (exit ${result.status ?? 'unknown'}) - see ${LOG_FILE} for detail.`,
    );
  }
  console.log(
    `[db] Ready. Prisma's DATABASE_URL: postgresql://${USER}:${PASSWORD}@localhost:${PORT}/automationdm`,
  );
  console.log(
    '[db] (the "automationdm" database itself is created on first `prisma migrate dev`.)',
  );
}

function stop() {
  if (!isInitialised()) {
    console.log('[db] Not initialized - nothing to stop.');
    return;
  }
  const result = run(bin('pg_ctl'), ['stop', '-D', DATA_DIR, '-m', 'fast']);
  console.log((result.stdout || result.stderr || '').trim());
  if (result.status !== 0) {
    throw new Error(`pg_ctl stop failed (exit ${result.status}).`);
  }
}

function reset() {
  if (isInitialised() && status()) {
    stop();
  }
  console.log(`[db] Deleting local data directory ${DATA_DIR} ...`);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('[db] Reset complete. Run "start" again to reinitialize.');
}

const commands = { start, stop, status, reset };
const command = process.argv[2];
const fn = commands[command];

if (!fn) {
  console.error(`Usage: node dev/local-db.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}

try {
  fn();
} catch (error) {
  console.error('[db] Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
