// Phase 17, migration A -> B backfill. Run ONCE per database, after migration A and before
// migration B. Not part of the app.
//
// Fills `automations.platform_post_id` (Instagram's own media id) for rows created before the
// pivot moved off Zernio's `_id`. The source is Zernio's own comment-automations list, which
// carries `platformPostId` on every item - no post lookup is needed, and crucially no
// dependency on Zernio having synced the post.
//
// Read-mostly and idempotent: it only ever writes rows whose platform_post_id is still null,
// so re-running it after a partial failure is safe.
//
// The automations table is read and written with raw SQL, not the generated client. The client
// follows the CURRENT schema.prisma, where platform_post_id is required and zernio_post_id no
// longer exists (migration B's end state). The database this runs against is between A and B,
// so neither is true there yet. The client version of this script failed with "Argument
// platformPostId must not be null" before sending a query.
//
// Usage (from the repo root):
//   scripts/pnpm.ps1 --filter "@automationdm/database" exec node dev/phase17-backfill-platform-post-id.mjs
//
// Requires ZERNIO_API_KEY and DATABASE_URL in the environment, and DATABASE_URL must point at
// the database you actually intend to change. Check it before running against production.

import { PrismaClient } from '@prisma/client';

const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';
const apiKey = process.env.ZERNIO_API_KEY;
if (!apiKey) {
  console.error('ZERNIO_API_KEY is not set. Cannot resolve media ids without it.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function zernioGet(path) {
  const response = await fetch(`${ZERNIO_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Zernio ${path} -> ${response.status}`);
  }
  return response.json();
}

const columns = await prisma.$queryRaw`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'automations'
    AND column_name IN ('platform_post_id', 'zernio_post_id')`;
const has = new Set(columns.map((row) => row.column_name));
if (!has.has('platform_post_id')) {
  console.error(
    'automations.platform_post_id does not exist: migration A ' +
      '(20260819154500_phase17_meta_connection_and_platform_post_id) has not been applied here. ' +
      'Apply it first.',
  );
  await prisma.$disconnect();
  process.exit(1);
}
if (!has.has('zernio_post_id')) {
  console.log('automations.zernio_post_id is already gone: migration B has run. Nothing to do.');
  await prisma.$disconnect();
  process.exit(0);
}

const pending = await prisma.$queryRaw`
  SELECT id, zernio_automation_id AS "zernioAutomationId", zernio_post_id AS "zernioPostId",
         organization_id AS "organizationId"
  FROM automations WHERE platform_post_id IS NULL`;

if (pending.length === 0) {
  console.log('Nothing to backfill - every automation already has a platform_post_id.');
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`${pending.length} automation(s) need a platform_post_id.`);

// One Zernio call per DISTINCT profile, not per automation.
const organizations = await prisma.organization.findMany({
  where: {
    id: { in: [...new Set(pending.map((a) => a.organizationId))] },
    NOT: { zernioProfileId: null },
  },
  select: { id: true, zernioProfileId: true },
});

/** zernioAutomationId -> platformPostId, across every profile involved. */
const mediaIdByAutomation = new Map();
for (const organization of organizations) {
  const body = await zernioGet(
    `/comment-automations?profileId=${encodeURIComponent(organization.zernioProfileId)}`,
  );
  for (const item of body.automations ?? []) {
    if (item.id && item.platformPostId) {
      mediaIdByAutomation.set(item.id, item.platformPostId);
    }
  }
}

let updated = 0;
const unresolved = [];
for (const automation of pending) {
  const mediaId = mediaIdByAutomation.get(automation.zernioAutomationId);
  if (!mediaId) {
    unresolved.push(automation);
    continue;
  }
  // `AND platform_post_id IS NULL` keeps the write idempotent even if two runs overlap.
  await prisma.$executeRaw`
    UPDATE automations SET platform_post_id = ${mediaId}
    WHERE id = ${automation.id} AND platform_post_id IS NULL`;
  updated += 1;
}

console.log(`Backfilled ${updated} automation(s).`);

if (unresolved.length > 0) {
  // Deliberately loud and non-zero-exit. An automation Zernio no longer knows about cannot be
  // given a media id from any source, and migration B's NOT NULL would fail on it. Decide what
  // to do with these by hand - almost certainly delete them, since an automation Zernio has
  // lost is not running either way - rather than letting the migration surprise you.
  console.error(`\n${unresolved.length} automation(s) could NOT be resolved:`);
  for (const automation of unresolved) {
    console.error(
      `  id=${automation.id} zernioAutomationId=${automation.zernioAutomationId} ` +
        `zernioPostId=${automation.zernioPostId ?? 'null'}`,
    );
  }
  console.error('\nDO NOT run migration B until these are resolved or deleted.');
  await prisma.$disconnect();
  process.exit(1);
}

console.log('GATE PASSED: every automation has a platform_post_id. Migration B is safe.');
await prisma.$disconnect();
