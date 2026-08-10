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

describe('POST /api/organizations', () => {
  it('rejects a request with no bearer token', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(401);
  });

  it('rejects a request with an invalid bearer token', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(401);
  });

  it('creates an organization and makes the caller its OWNER', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });

    const response = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(201);

    expect(response.body).toMatchObject({ name: 'Acme Inc', slug: 'acme', role: 'OWNER' });

    const membership = await prisma.organizationMember.findFirst({ where: { userId: alice.id } });
    expect(membership?.role).toBe('OWNER');
  });

  it('rejects a slug that is already taken', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(bob.id, bob.email))
      .send({ name: 'Acme Inc Two', slug: 'acme' })
      .expect(409);
  });

  it('rejects an invalid slug', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });

    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({ name: 'Acme Inc', slug: 'Not A Slug!' })
      .expect(400);
  });
});

describe('GET /api/organizations', () => {
  it('lists only the organizations the caller belongs to', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(bob.id, bob.email))
      .send({ name: 'Other Co', slug: 'other-co' })
      .expect(201);

    const aliceOrgs = await request(app.getHttpServer())
      .get('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .expect(200);

    expect(aliceOrgs.body).toHaveLength(1);
    expect(aliceOrgs.body[0]).toMatchObject({ slug: 'acme', role: 'OWNER' });
  });
});

describe('GET /api/organizations/:id/members - tenant isolation', () => {
  it("lets a member see their organization's member list", async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const created = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(201);

    const members = await request(app.getHttpServer())
      .get(`/api/organizations/${created.body.id}/members`)
      .set('Authorization', bearerFor(alice.id, alice.email))
      .expect(200);

    expect(members.body).toHaveLength(1);
    expect(members.body[0]).toMatchObject({ role: 'OWNER', user: { email: 'alice@example.com' } });
  });

  it("never returns another organization's members to a non-member", async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    const aliceOrg = await request(app.getHttpServer())
      .post('/api/organizations')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(201);

    // Bob is a real, authenticated user - just not a member of Alice's org. The response
    // must be 404, and critically must NOT contain Alice's org's member data anywhere.
    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${aliceOrg.body.id}/members`)
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
