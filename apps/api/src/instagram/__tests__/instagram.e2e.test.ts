import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma } from '@automationdm/database';
import { signInternalServiceToken } from '@automationdm/shared';
import type {
  ConnectedInstagramAccount,
  EnsureProfileResult,
  FindConnectedAccountInput,
  GetConnectUrlInput,
  GetConnectUrlResult,
  InstagramProvider,
} from '@automationdm/zernio';
import { AppModule } from '../../app.module';
import { INSTAGRAM_PROVIDER } from '../instagram-provider.token';

const INTERNAL_SECRET = process.env.API_INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error('API_INTERNAL_SECRET must be set (see .env) to run this test file.');
}

function bearerFor(userId: string, email: string): string {
  return `Bearer ${signInternalServiceToken({ sub: userId, email }, INTERNAL_SECRET as string)}`;
}

// A fake, in-memory InstagramProvider - never a live Zernio call, per docs/TESTING.md.
// Lets tests control exactly what "Zernio" reports back for findConnectedAccount, including
// deliberately wrong answers, without depending on real network access or real credentials.
class FakeInstagramProvider implements InstagramProvider {
  ensureProfileCallCount = 0;
  private profileCounter = 0;
  private connectedByProfile = new Map<string, ConnectedInstagramAccount>();

  // No params needed (the fake doesn't care about the profile name) - fewer params than the
  // interface declares is valid TypeScript, same pattern as ZernioInstagramProvider's own
  // stub methods, and avoids an unused-parameter lint error.
  async ensureProfile(): Promise<EnsureProfileResult> {
    this.ensureProfileCallCount += 1;
    this.profileCounter += 1;
    return { zernioProfileId: `fake-profile-${this.profileCounter}` };
  }

  async getConnectUrl(input: GetConnectUrlInput): Promise<GetConnectUrlResult> {
    return {
      authUrl: `https://fake-zernio.test/oauth?profileId=${input.zernioProfileId}&redirect_url=${encodeURIComponent(input.redirectUrl)}`,
    };
  }

  async findConnectedAccount(
    input: FindConnectedAccountInput,
  ): Promise<ConnectedInstagramAccount | null> {
    return this.connectedByProfile.get(input.zernioProfileId) ?? null;
  }

  setConnectedAccount(zernioProfileId: string, account: ConnectedInstagramAccount): void {
    this.connectedByProfile.set(zernioProfileId, account);
  }

  reset(): void {
    this.ensureProfileCallCount = 0;
    this.profileCounter = 0;
    this.connectedByProfile.clear();
  }
}

let app: INestApplication;
let fakeProvider: FakeInstagramProvider;

beforeAll(async () => {
  fakeProvider = new FakeInstagramProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(INSTAGRAM_PROVIDER)
    .useValue(fakeProvider)
    .compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

// Same full-reset approach as the organizations e2e tests - a throwaway local dev database.
beforeEach(async () => {
  await prisma.instagramAccount.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  // Reset the SAME instance bound into the Nest DI container in beforeAll - Nest resolved
  // the singleton once at module compile time, so replacing the outer variable here would
  // silently leave the app talking to a stale, un-reset object.
  fakeProvider.reset();
});

async function createOrgWithOwner(email: string) {
  const user = await prisma.user.create({ data: { email } });
  const organization = await prisma.organization.create({
    data: {
      name: 'Acme Inc',
      slug: `acme-${user.id}`,
      memberships: { create: { userId: user.id, role: 'OWNER' } },
    },
  });
  return { user, organization };
}

describe('POST /api/organizations/:id/instagram/connect', () => {
  it('rejects a request with no bearer token', async () => {
    const { organization } = await createOrgWithOwner('alice@example.com');
    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .expect(401);
  });

  it('404s for a caller who is not a member of the organization', async () => {
    const { organization } = await createOrgWithOwner('alice@example.com');
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);
  });

  it('returns an authUrl and persists a Zernio profile id on the organization', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');

    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);

    expect(response.body.authUrl).toContain('fake-zernio.test/oauth');
    expect(response.body.authUrl).toContain('redirect_url=');

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.zernioProfileId).toBeTruthy();
  });

  it('reuses the same Zernio profile id on a second connect attempt instead of creating another', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');

    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);

    expect(fakeProvider.ensureProfileCallCount).toBe(1);
  });
});

describe('POST /api/organizations/:id/instagram/callback', () => {
  it('connects the account when Zernio confirms it, and never trusts the request body alone', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const connectResponse = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);
    const profileId = new URL(connectResponse.body.authUrl).searchParams.get('profileId') as string;

    fakeProvider.setConnectedAccount(profileId, {
      zernioAccountId: 'ig-acct-1',
      username: 'acme_ig',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/callback`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ profileId, accountId: 'ig-acct-1' })
      .expect(201);

    expect(response.body).toMatchObject({
      zernioAccountId: 'ig-acct-1',
      username: 'acme_ig',
      status: 'CONNECTED',
    });

    const stored = await prisma.instagramAccount.findUnique({
      where: { zernioAccountId: 'ig-acct-1' },
    });
    expect(stored?.organizationId).toBe(organization.id);
  });

  it('rejects a profileId that does not belong to this organization', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/callback`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ profileId: 'someone-elses-profile', accountId: 'ig-acct-1' })
      .expect(400);
  });

  it('rejects an accountId Zernio does not confirm for this profile', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const connectResponse = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);
    const profileId = new URL(connectResponse.body.authUrl).searchParams.get('profileId') as string;

    // Zernio reports a different account than the one the caller claims - e.g. a tampered
    // or stale callback request.
    fakeProvider.setConnectedAccount(profileId, {
      zernioAccountId: 'ig-acct-real',
      username: 'acme_ig',
    });

    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/callback`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ profileId, accountId: 'ig-acct-forged' })
      .expect(400);
  });

  it('rejects reconnecting an Instagram account that already belongs to a different organization', async () => {
    const { user: alice, organization: aliceOrg } = await createOrgWithOwner('alice@example.com');
    const aliceConnect = await request(app.getHttpServer())
      .post(`/api/organizations/${aliceOrg.id}/instagram/connect`)
      .set('Authorization', bearerFor(alice.id, alice.email))
      .expect(201);
    const aliceProfileId = new URL(aliceConnect.body.authUrl).searchParams.get(
      'profileId',
    ) as string;
    fakeProvider.setConnectedAccount(aliceProfileId, {
      zernioAccountId: 'ig-shared',
      username: 'shared',
    });
    await request(app.getHttpServer())
      .post(`/api/organizations/${aliceOrg.id}/instagram/callback`)
      .set('Authorization', bearerFor(alice.id, alice.email))
      .send({ profileId: aliceProfileId, accountId: 'ig-shared' })
      .expect(201);

    const { user: bob, organization: bobOrg } = await createOrgWithOwner('bob@example.com');
    const bobConnect = await request(app.getHttpServer())
      .post(`/api/organizations/${bobOrg.id}/instagram/connect`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(201);
    const bobProfileId = new URL(bobConnect.body.authUrl).searchParams.get('profileId') as string;
    fakeProvider.setConnectedAccount(bobProfileId, {
      zernioAccountId: 'ig-shared',
      username: 'shared',
    });

    await request(app.getHttpServer())
      .post(`/api/organizations/${bobOrg.id}/instagram/callback`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .send({ profileId: bobProfileId, accountId: 'ig-shared' })
      .expect(409);
  });
});

describe('GET /api/organizations/:id/instagram/accounts', () => {
  it('lists connected accounts for a member, and 404s for a non-member', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const connectResponse = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);
    const profileId = new URL(connectResponse.body.authUrl).searchParams.get('profileId') as string;
    fakeProvider.setConnectedAccount(profileId, {
      zernioAccountId: 'ig-acct-1',
      username: 'acme_ig',
    });
    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/callback`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ profileId, accountId: 'ig-acct-1' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ zernioAccountId: 'ig-acct-1', username: 'acme_ig' });

    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });
    await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);
  });
});
