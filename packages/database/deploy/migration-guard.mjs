// Pure helpers for migrate-on-deploy.mjs: which migrations are pending, and which of them are
// too dangerous to apply without a person watching. No database access here, so it is unit
// tested directly (migration-guard.test.mjs).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Statements that can lose data, or break the code that is still running while a deploy rolls
 * out. A migration containing any of them is never auto-applied. Phase 17's migration B is the
 * model case: it needed a backfill before it and a code deploy between it and migration A.
 *
 * Deliberately NOT listed, because they lose no data and old code keeps working:
 * CREATE anything, ADD COLUMN, DROP NOT NULL (relaxing a constraint), DROP INDEX, DROP CONSTRAINT,
 * ALTER TYPE ... ADD VALUE. */
const DESTRUCTIVE_PATTERNS = [
  { label: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/i },
  { label: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/i },
  { label: 'DROP SCHEMA', pattern: /\bDROP\s+SCHEMA\b/i },
  { label: 'DROP TYPE', pattern: /\bDROP\s+TYPE\b/i },
  { label: 'TRUNCATE', pattern: /\bTRUNCATE\b/i },
  { label: 'DELETE FROM', pattern: /\bDELETE\s+FROM\b/i },
  { label: 'SET NOT NULL', pattern: /\bSET\s+NOT\s+NULL\b/i },
  { label: 'column type change', pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i },
  { label: 'RENAME', pattern: /\bRENAME\b/i },
];

/** Removes `--` line comments and block comments, so a migration that merely *mentions* a
 * dangerous statement in its explanation (Phase 17's migration B does, at length) is judged by
 * its SQL alone. String literals are not parsed: none of this repo's migrations put these
 * keywords inside a string, and a false positive only means a person applies it by hand. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** The labels of every destructive statement kind found in `sql`, in list order. */
export function findDestructiveStatements(sql) {
  const code = stripSqlComments(sql);
  return DESTRUCTIVE_PATTERNS.filter(({ pattern }) => pattern.test(code)).map(({ label }) => label);
}

/** Migration folder names under `migrationsDir`, oldest first (Prisma's own order: by name,
 * which starts with a timestamp). */
export function listMigrationNames(migrationsDir) {
  return readdirSync(migrationsDir)
    .filter((name) => statSync(join(migrationsDir, name)).isDirectory())
    .sort();
}

export function readMigrationSql(migrationsDir, name) {
  return readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
}
