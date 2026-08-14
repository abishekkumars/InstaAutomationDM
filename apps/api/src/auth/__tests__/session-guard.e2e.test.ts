import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import jwt from 'jsonwebtoken';
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

/** A token signed with the REAL secret that also carries extra claims the legitimate minter
 * never sends. Used to prove those claims are ignored rather than trusted - see the escalation
 * tests below. Mirrors signInternalServiceToken's own issuer/audience/algorithm so the only
 * difference from a genuine token is the smuggled payload. */
function forgedBearerWithClaims(claims: Record<string, unknown>): string {
  const token = jwt.sign(claims, INTERNAL_SECRET as string, {
    algorithm: 'HS256',
    issuer: 'automationdm-web',
    audience: 'automationdm-api',
    expiresIn: 60,
  });
  return `Bearer ${token}`;
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

// Same full-reset approach as the other e2e suites - a throwaway local dev database
// (docs/ADR/0003-local-postgresql-strategy.md), deletion order respects foreign keys.
beforeEach(async () => {
  await prisma.instagramAccount.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
});

describe('GET /api/me', () => {
  it('rejects a request with no bearer token', async () => {
    await request(app.getHttpServer()).get('/api/me').expect(401);
  });

  it('rejects a request with an invalid bearer token', async () => {
    await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('rejects a structurally valid token for a user that no longer exists', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const authorization = bearerFor(alice.id, alice.email);
    await prisma.user.delete({ where: { id: alice.id } });

    await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', authorization)
      .expect(401);
  });

  it('defaults a newly created user to NORMAL_USER', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });

    const response = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .expect(200);

    expect(response.body).toMatchObject({
      id: alice.id,
      email: 'alice@example.com',
      role: 'NORMAL_USER',
    });
  });

  it('reports ADMIN for a user whose stored role is ADMIN', async () => {
    const admin = await prisma.user.create({
      data: { email: 'admin@example.com', role: 'ADMIN' },
    });

    const response = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', bearerFor(admin.id, admin.email))
      .expect(200);

    expect(response.body.role).toBe('ADMIN');
  });

  it('never exposes the password hash', async () => {
    const alice = await prisma.user.create({
      data: { email: 'alice@example.com', passwordHash: 'not-a-real-hash' },
    });

    const response = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', bearerFor(alice.id, alice.email))
      .expect(200);

    expect(response.body).not.toHaveProperty('passwordHash');
    expect(Object.keys(response.body).sort()).toEqual(['email', 'id', 'role']);
  });
});

// Requirement 19/20: the role is an authorization decision, so it is resolved from the database
// and never from anything the caller supplied. These are the tests that would fail if someone
// later "optimized" the guard by reading role out of the token to save a query.
describe('role resolution cannot be driven by the caller', () => {
  it('ignores a role claim smuggled into an otherwise valid token', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });

    const response = await request(app.getHttpServer())
      .get('/api/me')
      .set(
        'Authorization',
        forgedBearerWithClaims({ sub: alice.id, email: alice.email, role: 'ADMIN' }),
      )
      .expect(200);

    expect(response.body.role).toBe('NORMAL_USER');
  });

  it('ignores a role sent in the request body or query string', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });
    const authorization = bearerFor(alice.id, alice.email);

    const queryResponse = await request(app.getHttpServer())
      .get('/api/me?role=ADMIN')
      .set('Authorization', authorization)
      .expect(200);
    expect(queryResponse.body.role).toBe('NORMAL_USER');

    // Still NORMAL_USER in the database afterwards - the request did not write anything.
    const stored = await prisma.user.findUnique({ where: { id: alice.id } });
    expect(stored?.role).toBe('NORMAL_USER');
  });

  it('reflects a revoked role immediately, without waiting for the token to expire', async () => {
    const admin = await prisma.user.create({
      data: { email: 'admin@example.com', role: 'ADMIN' },
    });
    // One token, minted while they were an admin, reused across the revocation.
    const authorization = bearerFor(admin.id, admin.email);

    const before = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(before.body.role).toBe('ADMIN');

    await prisma.user.update({ where: { id: admin.id }, data: { role: 'NORMAL_USER' } });

    const after = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(after.body.role).toBe('NORMAL_USER');
  });

  it('resolves email from the database, not from the token', async () => {
    const alice = await prisma.user.create({ data: { email: 'alice@example.com' } });

    const response = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', bearerFor(alice.id, 'attacker@example.com'))
      .expect(200);

    expect(response.body.email).toBe('alice@example.com');
  });
});
