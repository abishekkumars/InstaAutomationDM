import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma } from '@automationdm/database';
import { signInternalServiceToken } from '@automationdm/shared';
import { AppModule } from '../../app.module';

const INTERNAL_SECRET = process.env.API_INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error('API_INTERNAL_SECRET must be set (see .env) to run this test file.');
}

function bearerFor(userId: string, email: string): string {
  return `Bearer ${signInternalServiceToken({ sub: userId, email }, INTERNAL_SECRET as string)}`;
}

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

// Same full-reset approach as packages/database's tests - a throwaway local dev database
// (docs/ADR/0003-local-postgresql-strategy.md), deletion order respects foreign keys.
beforeEach(async () => {
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
});

/** Creates an organization directly, with `owner` as its OWNER.
 *
 * Phase 15.3 removed `POST /api/organizations`, which these tests previously used to build their
 * fixtures. Setting them up through Prisma is actually the better arrangement anyway: a test of
 * "can Bob read Alice's members" should not also depend on the create endpoint working. */
async function createOrganization(slug: string, name: string, owner?: { id: string }) {
  return prisma.organization.create({
    data: {
      name,
      slug,
      memberships: owner ? { create: { userId: owner.id, role: 'OWNER' } } : undefined,
    },
  });
}

// Phase 15.3, requirement 16. Self-service organization creation is gone: membership is the
// access gate, so a user waiting to be admitted must not be able to admit themselves. Creating
// organizations now lives behind AdminGuard at POST /api/admin/organizations.
describe('POST /api/organizations - removed in Phase 15.3', () => {
  it('is no longer routed, even for an authenticated caller', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });

    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(404);

    expect(await prisma.organization.count()).toBe(0);
  });
});

describe('GET /api/organizations', () => {
  it('lists only the organizations the caller belongs to', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    await createOrganization('acme', 'Acme Inc', alice);
    await createOrganization('other-co', 'Other Co', bob);

    const aliceOrgs = await request(app.getHttpServer())
      .get('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .expect(200);

    expect(aliceOrgs.body).toHaveLength(1);
    expect(aliceOrgs.body[0]).toMatchObject({ slug: 'acme', role: 'OWNER' });
  });

  // The state a newly registered user is in until an administrator admits them - what the
  // dashboard's awaiting-access screen renders from (Phase 15.3).
  it('returns an empty list for a user with no memberships', async () => {
    const newcomer = await prisma.user.create({ data: { email: 'newcomer@example.com' } });

    const response = await request(app.getHttpServer())
      .get('/api/organizations')
      .set('Authorization', bearerFor(newcomer.id, newcomer.email))
      .expect(200);

    expect(response.body).toEqual([]);
  });
});

describe('GET /api/organizations/:id/members - tenant isolation', () => {
  it("lets a member see their organization's member list", async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const created = await createOrganization('acme', 'Acme Inc', alice);

    const members = await request(app.getHttpServer())
      .get(`/api/organizations/${created.id}/members`)
      .set('Authorization', bearerFor(alice.id, alice.email))
      .expect(200);

    expect(members.body).toHaveLength(1);
    expect(members.body[0]).toMatchObject({ role: 'OWNER', user: { email: 'alice@example.com' } });
  });

  it("never returns another organization's members to a non-member", async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    const aliceOrg = await createOrganization('acme', 'Acme Inc', alice);

    // Bob is a real, authenticated user - just not a member of Alice's org. The response
    // must be 404, and critically must NOT contain Alice's org's member data anywhere.
    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${aliceOrg.id}/members`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);

    expect(JSON.stringify(response.body)).not.toContain('alice@example.com');
  });

  it('404s for a nonexistent organization id, same as a real org the caller is not in', async () => {
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    await request(app.getHttpServer())
      .get('/api/organizations/does-not-exist/members')
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);
  });
});
