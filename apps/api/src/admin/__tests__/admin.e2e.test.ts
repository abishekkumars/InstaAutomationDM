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

async function createAdmin(email = 'admin@example.com') {
  return prisma.user.create({ data: { email, role: 'ADMIN' } });
}

async function createNormalUser(email = 'alice@example.com') {
  return prisma.user.create({ data: { email } });
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

beforeEach(async () => {
  await prisma.instagramAccount.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
});

// Requirement 19: the permission check is enforced in apps/api, on every admin route, and does
// not depend on apps/web having hidden anything.
describe('admin routes reject non-administrators', () => {
  const ROUTES: Array<[string, 'get' | 'post' | 'patch' | 'delete', string]> = [
    ['list users', 'get', '/api/admin/users'],
    ['list organizations', 'get', '/api/admin/organizations'],
    ['create organization', 'post', '/api/admin/organizations'],
    ['add membership', 'post', '/api/admin/users/some-user/memberships'],
    ['remove membership', 'delete', '/api/admin/users/some-user/memberships/some-org'],
    ['update role', 'patch', '/api/admin/users/some-user/role'],
  ];

  it.each(ROUTES)('%s requires a token', async (_label, method, path) => {
    await request(app.getHttpServer())[method](path).expect(401);
  });

  it.each(ROUTES)('%s rejects a NORMAL_USER with 403', async (_label, method, path) => {
    const alice = await createNormalUser();

    await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({})
      .expect(403);
  });

  // The role is read from the database, so a user promoted mid-session gets in on their very
  // next request - and, more importantly, a demoted one is locked out just as fast.
  it('admits a user the moment they are granted ADMIN, using the same token', async () => {
    const alice = await createNormalUser();
    const authorization = bearerFor(alice.id, alice.email);

    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', authorization)
      .expect(403);

    await prisma.user.update({ where: { id: alice.id }, data: { role: 'ADMIN' } });

    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', authorization)
      .expect(200);
  });
});

describe('GET /api/admin/users', () => {
  it('lists users with their memberships, newest first, and never a password hash', async () => {
    const admin = await createAdmin();
    const alice = await prisma.user.create({
      data: { email: 'alice@example.com', name: 'Alice', passwordHash: 'not-a-real-hash' },
    });
    const organization = await prisma.organization.create({
      data: { name: 'Acme Inc', slug: 'acme', memberships: { create: { userId: alice.id } } },
    });

    const response = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .expect(200);

    expect(response.body).toHaveLength(2);
    // alice was created after admin, and the list is newest-first.
    const [first, second] = response.body;
    expect(first.email).toBe('alice@example.com');
    expect(second.email).toBe('admin@example.com');

    expect(first.organizations).toEqual([
      {
        organizationId: organization.id,
        name: 'Acme Inc',
        slug: 'acme',
        role: 'MEMBER',
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('not-a-real-hash');
    expect(first).not.toHaveProperty('passwordHash');
  });

  it('suggests a slug derived from the email, avoiding one already taken', async () => {
    const admin = await createAdmin();
    await prisma.user.create({ data: { email: 'john@example.com' } });

    const first = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .expect(200);
    expect(
      first.body.find((u: { email: string }) => u.email === 'john@example.com').suggestedSlug,
    ).toBe('john');

    // Once `john` exists, the same user's suggestion must move on rather than propose a slug
    // that would collide - and, through the slug, share a Zernio profile.
    await prisma.organization.create({ data: { name: 'John', slug: 'john' } });

    const second = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .expect(200);
    expect(
      second.body.find((u: { email: string }) => u.email === 'john@example.com').suggestedSlug,
    ).toBe('john-2');
  });
});

describe('POST /api/admin/organizations', () => {
  it('creates an organization and makes the named user its OWNER', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();

    const response = await request(app.getHttpServer())
      .post('/api/admin/organizations')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ name: 'Acme Inc', slug: 'acme', ownerUserId: alice.id })
      .expect(201);

    expect(response.body).toMatchObject({ name: 'Acme Inc', slug: 'acme', memberCount: 1 });

    const membership = await prisma.organizationMember.findFirst({ where: { userId: alice.id } });
    expect(membership?.role).toBe('OWNER');
  });

  it('creates an organization with no owner when none is named', async () => {
    const admin = await createAdmin();

    const response = await request(app.getHttpServer())
      .post('/api/admin/organizations')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ name: 'Acme Inc', slug: 'acme' })
      .expect(201);

    expect(response.body.memberCount).toBe(0);
  });

  it('rejects an invalid slug', async () => {
    const admin = await createAdmin();

    await request(app.getHttpServer())
      .post('/api/admin/organizations')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ name: 'Acme Inc', slug: 'Not A Slug' })
      .expect(400);
  });

  it('rejects a duplicate slug with 409', async () => {
    const admin = await createAdmin();
    await prisma.organization.create({ data: { name: 'Acme', slug: 'acme' } });

    await request(app.getHttpServer())
      .post('/api/admin/organizations')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ name: 'Acme Two', slug: 'acme' })
      .expect(409);
  });

  it('404s when the named owner does not exist', async () => {
    const admin = await createAdmin();

    await request(app.getHttpServer())
      .post('/api/admin/organizations')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ name: 'Acme Inc', slug: 'acme', ownerUserId: 'no-such-user' })
      .expect(404);

    // And nothing was created despite the failure.
    expect(await prisma.organization.count()).toBe(0);
  });
});

describe('memberships', () => {
  it('adds a membership, defaulting the organization role to OWNER', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();
    const organization = await prisma.organization.create({
      data: { name: 'Acme Inc', slug: 'acme' },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/admin/users/${alice.id}/memberships`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ organizationId: organization.id })
      .expect(201);

    expect(response.body).toMatchObject({ slug: 'acme', role: 'OWNER' });
  });

  it('honours an explicit organization role', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();
    const organization = await prisma.organization.create({
      data: { name: 'Acme Inc', slug: 'acme' },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/admin/users/${alice.id}/memberships`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ organizationId: organization.id, role: 'MEMBER' })
      .expect(201);

    expect(response.body.role).toBe('MEMBER');
  });

  it('rejects a duplicate membership with 409', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();
    const organization = await prisma.organization.create({
      data: { name: 'Acme Inc', slug: 'acme', memberships: { create: { userId: alice.id } } },
    });

    await request(app.getHttpServer())
      .post(`/api/admin/users/${alice.id}/memberships`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ organizationId: organization.id })
      .expect(409);
  });

  it('404s for an unknown user or organization', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();
    const organization = await prisma.organization.create({
      data: { name: 'Acme Inc', slug: 'acme' },
    });

    await request(app.getHttpServer())
      .post('/api/admin/users/no-such-user/memberships')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ organizationId: organization.id })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/admin/users/${alice.id}/memberships`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ organizationId: 'no-such-org' })
      .expect(404);
  });

  it('removes a membership, revoking that user access to the organization', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();
    const organization = await prisma.organization.create({
      data: { name: 'Acme Inc', slug: 'acme', memberships: { create: { userId: alice.id } } },
    });

    await request(app.getHttpServer())
      .delete(`/api/admin/users/${alice.id}/memberships/${organization.id}`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .expect(204);

    expect(await prisma.organizationMember.count()).toBe(0);
    // The organization itself survives - revoking one person's access must not delete
    // everyone else's data.
    expect(await prisma.organization.count()).toBe(1);
  });

  it('404s when removing a membership that does not exist', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();
    const organization = await prisma.organization.create({
      data: { name: 'Acme Inc', slug: 'acme' },
    });

    await request(app.getHttpServer())
      .delete(`/api/admin/users/${alice.id}/memberships/${organization.id}`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .expect(404);
  });
});

describe('PATCH /api/admin/users/:userId/role', () => {
  it('grants ADMIN', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();

    const response = await request(app.getHttpServer())
      .patch(`/api/admin/users/${alice.id}/role`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ role: 'ADMIN' })
      .expect(200);

    expect(response.body.role).toBe('ADMIN');
    expect((await prisma.user.findUnique({ where: { id: alice.id } }))?.role).toBe('ADMIN');
  });

  it('revokes ADMIN when another administrator remains', async () => {
    const admin = await createAdmin();
    const other = await createAdmin('other@example.com');

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${other.id}/role`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ role: 'NORMAL_USER' })
      .expect(200);

    expect((await prisma.user.findUnique({ where: { id: other.id } }))?.role).toBe('NORMAL_USER');
  });

  it('lets an administrator step down while another remains', async () => {
    const admin = await createAdmin();
    await createAdmin('other@example.com');

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${admin.id}/role`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ role: 'NORMAL_USER' })
      .expect(200);
  });

  // The lockout guard. Without it, the last admin can revoke themselves and leave the
  // Administration surface permanently unreachable.
  it('refuses to revoke the last remaining administrator', async () => {
    const admin = await createAdmin();

    const response = await request(app.getHttpServer())
      .patch(`/api/admin/users/${admin.id}/role`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ role: 'NORMAL_USER' })
      .expect(409);

    // Asserted against the raw body text rather than a specific JSON path. This harness builds
    // the app with Test.createTestingModule and never calls main.ts, which is where
    // AllExceptionsFilter is registered - so errors here carry Nest's default
    // `{statusCode, message, error}` shape, not the `{error: {code, message, requestId}}` shape
    // documented in docs/API-SPEC.md. Matching on the text is true under both.
    expect(response.text).toContain('only administrator');
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.role).toBe('ADMIN');
  });

  it('rejects an unknown role value', async () => {
    const admin = await createAdmin();
    const alice = await createNormalUser();

    await request(app.getHttpServer())
      .patch(`/api/admin/users/${alice.id}/role`)
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ role: 'SUPERUSER' })
      .expect(400);

    expect((await prisma.user.findUnique({ where: { id: alice.id } }))?.role).toBe('NORMAL_USER');
  });

  it('404s for an unknown user', async () => {
    const admin = await createAdmin();

    await request(app.getHttpServer())
      .patch('/api/admin/users/no-such-user/role')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .send({ role: 'ADMIN' })
      .expect(404);
  });
});
