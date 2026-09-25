// Phase 17 migration gate. Reports whether every automation row has the new pivot
// (`platform_post_id`) before migration B makes it required and drops `zernio_post_id`.
// Not part of the app - delete once the migration is done.
//
// Raw SQL rather than the generated client, for the reason given in
// phase17-backfill-platform-post-id.mjs: the client follows the post-migration-B schema.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const columns = await prisma.$queryRaw`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'automations'
    AND column_name IN ('platform_post_id', 'zernio_post_id')`;
const has = new Set(columns.map((row) => row.column_name));

if (!has.has('platform_post_id')) {
  console.log('GATE FAILED: migration A has not been applied (no platform_post_id column).');
} else {
  const [row] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE platform_post_id IS NULL)::int AS "missingPlatformPostId"
    FROM automations`;
  console.log(
    JSON.stringify({ ...row, zernioPostIdColumnStillPresent: has.has('zernio_post_id') }),
  );
  console.log(
    row.missingPlatformPostId === 0
      ? 'GATE PASSED: safe to run migration B.'
      : 'GATE FAILED: backfill first.',
  );
}
await prisma.$disconnect();
