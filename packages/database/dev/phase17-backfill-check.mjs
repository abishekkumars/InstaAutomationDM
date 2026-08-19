// Phase 17 migration gate. Reports whether every automation row has the new pivot
// (`platform_post_id`) before migration B makes it required and drops `zernio_post_id`.
// Not part of the app - delete once the migration is done.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const total = await prisma.automation.count();
const missing = await prisma.automation.count({ where: { platformPostId: null } });
const legacy = await prisma.automation.count({ where: { NOT: { zernioPostId: null } } });

console.log(
  JSON.stringify({ total, missingPlatformPostId: missing, stillCarryingZernioPostId: legacy }),
);
console.log(
  missing === 0 ? 'GATE PASSED: safe to run migration B.' : 'GATE FAILED: backfill first.',
);
await prisma.$disconnect();
