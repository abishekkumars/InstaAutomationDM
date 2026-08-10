// Development-only seed data. Never run automatically against production, never contains
// real credentials, and is idempotent (safe to run repeatedly - uses upsert keyed on each
// table's unique field, not insert).
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed] Refusing to run: NODE_ENV=production.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'dev@automationdm.local' },
    update: {},
    create: {
      email: 'dev@automationdm.local',
      name: 'Local Dev User',
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: 'dev-workspace' },
    update: {},
    create: {
      name: 'Dev Workspace',
      slug: 'dev-workspace',
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: 'OWNER',
    },
  });

  console.log(`[seed] Ready: user "${user.email}" owns organization "${organization.slug}".`);
}

main()
  .catch((error) => {
    console.error('[seed] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
