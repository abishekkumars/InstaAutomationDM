import bcrypt from 'bcryptjs';
import { prisma } from '@automationdm/database';
import {
  E2E_AUTOMATIONS,
  E2E_EMAIL,
  E2E_HANDLE,
  E2E_ORG_NAME,
  E2E_ORG_SLUG,
  E2E_PASSWORD,
} from './fixtures';

/** Seeds the browser tests' own user and organization, then checks the app is up.
 *
 * The tests drive the real running dev stack, which reads the development database - so, unlike
 * the vitest suites, nothing here deletes anything but its own rows. It upserts one user and one
 * organization (no Zernio profile, so apps/api never calls Zernio or Instagram for it) and
 * replaces that organization's fake account and automations. Your own users, organizations and
 * connected accounts are never read or written. Refuses to run against a non-localhost database. */
export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (!url || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error(
      'E2E setup refuses to seed: DATABASE_URL is not a localhost database. Run through ' +
        'scripts/e2e.ps1, which loads the repo .env.',
    );
  }

  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  try {
    const response = await fetch(`${baseURL}/status`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `The app is not reachable at ${baseURL} (${error instanceof Error ? error.message : error}). ` +
        'Start the dev stack first with scripts/dev.ps1.',
    );
  }

  try {
    const passwordHash = await bcrypt.hash(E2E_PASSWORD, 10);
    const user = await prisma.user.upsert({
      where: { email: E2E_EMAIL },
      update: { passwordHash, name: 'E2E Tester' },
      create: { email: E2E_EMAIL, name: 'E2E Tester', passwordHash },
    });

    const organization = await prisma.organization.upsert({
      where: { slug: E2E_ORG_SLUG },
      update: { name: E2E_ORG_NAME },
      create: { name: E2E_ORG_NAME, slug: E2E_ORG_SLUG },
    });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { role: 'OWNER' },
      create: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
    });

    // Replaced every run so each test starts from the same rows (automations cascade).
    await prisma.instagramAccount.deleteMany({ where: { organizationId: organization.id } });

    // The template tests (Phase 19) start from no templates. Cleared here, before any page has
    // loaded, and never mid-run: the web app caches the template list, and a direct database
    // delete does not invalidate that cache the way the app's own actions do. Each template test
    // deletes its last template through the UI instead, which leaves the next one empty.
    await prisma.automationTemplate.deleteMany({ where: { organizationId: organization.id } });
    const account = await prisma.instagramAccount.create({
      data: {
        organizationId: organization.id,
        zernioAccountId: 'e2e-zernio-account',
        username: E2E_HANDLE,
        status: 'CONNECTED',
      },
    });
    const now = Date.now();
    for (const [index, [name, keywords, isActive]] of E2E_AUTOMATIONS.entries()) {
      const n = String(index + 1).padStart(2, '0');
      await prisma.automation.create({
        data: {
          organizationId: organization.id,
          instagramAccountId: account.id,
          zernioAutomationId: `e2e-automation-${n}`,
          platformPostId: `e2e-post-${n}`,
          name,
          keywords,
          isActive,
          commentReplyVariations: [],
          dmMessage: `DM for ${name}`,
          createdAt: new Date(now - index * 36e5),
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
