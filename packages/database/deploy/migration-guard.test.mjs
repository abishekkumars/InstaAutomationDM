import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findDestructiveStatements,
  listMigrationNames,
  readMigrationSql,
  stripSqlComments,
} from './migration-guard.mjs';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');

describe('findDestructiveStatements', () => {
  it('flags statements that lose data or break running code', () => {
    expect(findDestructiveStatements('ALTER TABLE "a" DROP COLUMN "b";')).toEqual(['DROP COLUMN']);
    expect(findDestructiveStatements('DROP TABLE "a";')).toEqual(['DROP TABLE']);
    expect(findDestructiveStatements('ALTER TABLE "a" ALTER COLUMN "b" SET NOT NULL;')).toEqual([
      'SET NOT NULL',
    ]);
    expect(findDestructiveStatements('ALTER TABLE "a" ALTER COLUMN "b" TYPE INTEGER;')).toEqual([
      'column type change',
    ]);
    expect(findDestructiveStatements('ALTER TABLE "a" RENAME COLUMN "b" TO "c";')).toEqual([
      'RENAME',
    ]);
    expect(findDestructiveStatements('DELETE FROM "a";')).toEqual(['DELETE FROM']);
  });

  it('allows additive and constraint-relaxing statements', () => {
    const sql = [
      'CREATE TABLE "a" ("id" TEXT NOT NULL);',
      'ALTER TABLE "a" ADD COLUMN "b" TEXT;',
      'ALTER TABLE "a" ALTER COLUMN "b" DROP NOT NULL;',
      'DROP INDEX "a_b_idx";',
      'ALTER TYPE "E" ADD VALUE \'X\';',
    ].join('\n');
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it('ignores dangerous words that appear only in comments', () => {
    const sql =
      '-- this migration will DROP COLUMN later\n/* SET NOT NULL */\nCREATE TABLE "a" ();';
    expect(stripSqlComments(sql)).not.toMatch(/DROP|NOT NULL/);
    expect(findDestructiveStatements(sql)).toEqual([]);
  });
});

describe('the real migrations folder', () => {
  it('blocks exactly the one migration that has to be applied by hand (Phase 17, B)', () => {
    const flagged = listMigrationNames(migrationsDir).filter(
      (name) => findDestructiveStatements(readMigrationSql(migrationsDir, name)).length > 0,
    );
    expect(flagged).toEqual(['20260819163000_phase17_drop_zernio_post_id']);
  });

  it('auto-applies the Phase 19 templates migration', () => {
    expect(
      findDestructiveStatements(
        readMigrationSql(migrationsDir, '20260925124849_phase19_automation_templates'),
      ),
    ).toEqual([]);
  });

  it('lists migrations oldest first', () => {
    const names = listMigrationNames(migrationsDir);
    expect(names).toEqual([...names].sort());
    expect(names[0]).toBe('20260810172436_init');
  });
});
