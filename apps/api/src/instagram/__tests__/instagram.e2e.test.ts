import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma } from '@automationdm/database';
import { signInternalServiceToken } from '@automationdm/shared';
import type {
  CommentAutomation,
  ConnectedInstagramAccount,
  CreateCommentAutomationInput,
  EnsureProfileInput,
  EnsureProfileResult,
  FindConnectedAccountInput,
  GetConnectUrlInput,
  GetConnectUrlResult,
  GetPostInput,
  InstagramPost,
  InstagramProvider,
  ListPostsInput,
  ListPostsResult,
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

  // Models the real provider's lookup-before-create contract: a profile name that already
  // exists resolves to the SAME id and is reported as reused, rather than minting another.
  // A fake that always returned a fresh id would let a duplicate-creating regression pass.
  private profileIdsByName = new Map<string, string>();

  async ensureProfile(input: EnsureProfileInput): Promise<EnsureProfileResult> {
    this.ensureProfileCallCount += 1;
    const existing = this.profileIdsByName.get(input.name);
    if (existing) {
      return { zernioProfileId: existing, reused: true };
    }
    this.profileCounter += 1;
    const zernioProfileId = `fake-profile-${this.profileCounter}`;
    this.profileIdsByName.set(input.name, zernioProfileId);
    return { zernioProfileId, reused: false };
  }

  /** Simulates a Zernio profile that already exists for `name` - i.e. one created by a prior
   * attempt whose id we never persisted locally. */
  seedProfile(name: string, zernioProfileId: string): void {
    this.profileIdsByName.set(name, zernioProfileId);
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

  private postsByAccount = new Map<string, InstagramPost[]>();

  async listPosts(input: ListPostsInput): Promise<ListPostsResult> {
    const all = this.postsByAccount.get(input.zernioAccountId) ?? [];
    const start = (input.page - 1) * input.limit;
    return {
      posts: all.slice(start, start + input.limit),
      pagination: {
        page: input.page,
        limit: input.limit,
        total: all.length,
        pages: Math.max(1, Math.ceil(all.length / input.limit)),
      },
    };
  }

  async getPost(input: GetPostInput): Promise<InstagramPost | null> {
    for (const posts of this.postsByAccount.values()) {
      const found = posts.find((p) => p.zernioPostId === input.zernioPostId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  setPosts(zernioAccountId: string, posts: InstagramPost[]): void {
    this.postsByAccount.set(zernioAccountId, posts);
  }

  // Not exercised by this file's own tests (see automations.e2e.test.ts) - present only to
  // satisfy InstagramProvider's contract.
  async createCommentAutomation(input: CreateCommentAutomationInput): Promise<CommentAutomation> {
    return {
      zernioAutomationId: 'unused',
      zernioAccountId: input.zernioAccountId,
      zernioPostId: input.zernioPostId,
      platformPostId: input.platformPostId,
      name: input.name,
      keywords: input.keywords,
      matchMode: input.matchMode,
      commentReply: input.commentReply ?? null,
      buttons: input.buttons ?? [],
      dmMessage: input.dmMessage,
      isActive: true,
      stats: null,
    };
  }

  // Not exercised by this file's own tests (see automations.e2e.test.ts) - present only to
  // satisfy InstagramProvider's contract.
  async listCommentAutomations(): Promise<CommentAutomation[]> {
    return [];
  }

  reset(): void {
    this.ensureProfileCallCount = 0;
    this.profileCounter = 0;
    this.profileIdsByName.clear();
    this.connectedByProfile.clear();
    this.postsByAccount.clear();
  }
}

function fakePost(overrides: Partial<InstagramPost> & { zernioPostId: string }): InstagramPost {
  return {
    platformPostId: null,
    permalink: null,
    caption: '',
    mediaType: null,
    thumbnailUrl: null,
    publishedAt: null,
    zernioAccountId: null,
    ...overrides,
  };
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

// Connects and confirms an Instagram account for an organization, end to end through the
// real connect+callback routes - reused by the posts-listing tests below, which need an
// already-connected InstagramAccount row to operate on.
async function connectAndConfirmAccount(
  app: INestApplication,
  user: { id: string; email: string },
  organization: { id: string },
  zernioAccountId: string,
  username: string,
) {
  const connectResponse = await request(app.getHttpServer())
    .post(`/api/organizations/${organization.id}/instagram/connect`)
    .set('Authorization', bearerFor(user.id, user.email))
    .expect(201);
  const profileId = new URL(connectResponse.body.authUrl).searchParams.get('profileId') as string;
  fakeProvider.setConnectedAccount(profileId, { zernioAccountId, username });
  const callbackResponse = await request(app.getHttpServer())
    .post(`/api/organizations/${organization.id}/instagram/callback`)
    .set('Authorization', bearerFor(user.id, user.email))
    .send({ profileId, accountId: zernioAccountId })
    .expect(201);
  return { accountId: callbackResponse.body.id as string, profileId };
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

    expect(response.body.alreadyConnected).toBe(false);
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

  it('adopts an existing Zernio profile for the same slug instead of creating a duplicate', async () => {
    // The real bug this guards: an organization whose zernioProfileId was never persisted
    // (a crash or failed DB write after Zernio's create succeeded) used to POST a brand new
    // profile on the next attempt, leaving two Zernio profiles for one organization.
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    fakeProvider.seedProfile(organization.slug, 'pre-existing-profile');

    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);

    expect(new URL(response.body.authUrl).searchParams.get('profileId')).toBe(
      'pre-existing-profile',
    );
    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id } });
    expect(updated.zernioProfileId).toBe('pre-existing-profile');
  });

  it('returns the already-connected account instead of an authUrl when Zernio already has one', async () => {
    // The second half of the same bug: connect used to always hand back an OAuth URL, so a
    // user with a perfectly good connection was sent through the whole authorize flow again.
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    fakeProvider.seedProfile(organization.slug, 'profile-1');
    fakeProvider.setConnectedAccount('profile-1', {
      zernioAccountId: 'ig-already',
      username: 'already_ig',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);

    expect(response.body).toMatchObject({
      alreadyConnected: true,
      account: { zernioAccountId: 'ig-already', username: 'already_ig', status: 'CONNECTED' },
    });
    expect(response.body.authUrl).toBeUndefined();

    // Reconciled into our own database without the user ever going through OAuth.
    const stored = await prisma.instagramAccount.findUnique({
      where: { zernioAccountId: 'ig-already' },
    });
    expect(stored?.organizationId).toBe(organization.id);
  });

  it('does not create a second local row when connect runs again for an already-connected account', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    fakeProvider.seedProfile(organization.slug, 'profile-1');
    fakeProvider.setConnectedAccount('profile-1', {
      zernioAccountId: 'ig-already',
      username: 'already_ig',
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer())
        .post(`/api/organizations/${organization.id}/instagram/connect`)
        .set('Authorization', bearerFor(user.id, user.email))
        .expect(201);
    }

    const accounts = await prisma.instagramAccount.findMany({
      where: { organizationId: organization.id },
    });
    expect(accounts).toHaveLength(1);
  });

  it('falls back to the OAuth flow when the connected account belongs to another organization', async () => {
    // A cross-tenant collision must never be silently adopted - connect hands back a normal
    // authUrl and lets handleCallback raise the proper 409 instead.
    const { user: alice, organization: aliceOrg } = await createOrgWithOwner('alice@example.com');
    fakeProvider.seedProfile(aliceOrg.slug, 'alice-profile');
    fakeProvider.setConnectedAccount('alice-profile', {
      zernioAccountId: 'ig-shared',
      username: 'shared',
    });
    await request(app.getHttpServer())
      .post(`/api/organizations/${aliceOrg.id}/instagram/connect`)
      .set('Authorization', bearerFor(alice.id, alice.email))
      .expect(201);

    const { user: bob, organization: bobOrg } = await createOrgWithOwner('bob@example.com');
    fakeProvider.seedProfile(bobOrg.slug, 'bob-profile');
    fakeProvider.setConnectedAccount('bob-profile', {
      zernioAccountId: 'ig-shared',
      username: 'shared',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${bobOrg.id}/instagram/connect`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(201);

    expect(response.body.alreadyConnected).toBe(false);
    expect(response.body.authUrl).toContain('fake-zernio.test/oauth');
    const stored = await prisma.instagramAccount.findUniqueOrThrow({
      where: { zernioAccountId: 'ig-shared' },
    });
    expect(stored.organizationId).toBe(aliceOrg.id);
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

describe('GET /api/organizations/:id/instagram/accounts/:accountId/posts', () => {
  it('lists posts for a connected account and passes pagination through', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    fakeProvider.setPosts('ig-acct-1', [
      fakePost({ zernioPostId: 'post-1', zernioAccountId: 'ig-acct-1', caption: 'First' }),
      fakePost({ zernioPostId: 'post-2', zernioAccountId: 'ig-acct-1', caption: 'Second' }),
    ]);

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts`)
      .query({ page: 1, limit: 1 })
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body.posts).toHaveLength(1);
    expect(response.body.posts[0]).toMatchObject({ zernioPostId: 'post-1', caption: 'First' });
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 1, total: 2, pages: 2 });
  });

  it('rejects a limit above the maximum instead of silently clamping it', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts`)
      .query({ limit: 501 })
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(400);
  });

  it('404s for an accountId that belongs to a different organization', async () => {
    const { user: alice, organization: aliceOrg } = await createOrgWithOwner('alice@example.com');
    const { accountId: aliceAccountId } = await connectAndConfirmAccount(
      app,
      alice,
      aliceOrg,
      'ig-acct-alice',
      'alice_ig',
    );

    const { user: bob, organization: bobOrg } = await createOrgWithOwner('bob@example.com');
    await connectAndConfirmAccount(app, bob, bobOrg, 'ig-acct-bob', 'bob_ig');

    await request(app.getHttpServer())
      .get(`/api/organizations/${bobOrg.id}/instagram/accounts/${aliceAccountId}/posts`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);
  });
});

describe('GET /api/organizations/:id/instagram/accounts/:accountId/posts/:postId', () => {
  it('returns a single post', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    fakeProvider.setPosts('ig-acct-1', [
      fakePost({
        zernioPostId: 'post-1',
        zernioAccountId: 'ig-acct-1',
        caption: 'Hello world',
        permalink: 'https://instagram.com/p/abc123',
      }),
    ]);

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body).toMatchObject({
      zernioPostId: 'post-1',
      caption: 'Hello world',
      permalink: 'https://instagram.com/p/abc123',
    });
  });

  it('404s for a post that belongs to a different account, even if the id is guessed correctly', async () => {
    // Zernio's own GET /v1/posts/{postId} has no accountId filter - it's scoped only by our
    // single, org-wide API key. Without apps/api's own ownership check, this would let any
    // organization read any other organization's post by guessing its zernioPostId.
    const { user: alice, organization: aliceOrg } = await createOrgWithOwner('alice@example.com');
    await connectAndConfirmAccount(app, alice, aliceOrg, 'ig-acct-alice', 'alice_ig');
    fakeProvider.setPosts('ig-acct-alice', [
      fakePost({
        zernioPostId: 'post-secret',
        zernioAccountId: 'ig-acct-alice',
        caption: 'Private',
      }),
    ]);

    const { user: bob, organization: bobOrg } = await createOrgWithOwner('bob@example.com');
    const { accountId: bobAccountId } = await connectAndConfirmAccount(
      app,
      bob,
      bobOrg,
      'ig-acct-bob',
      'bob_ig',
    );

    await request(app.getHttpServer())
      .get(`/api/organizations/${bobOrg.id}/instagram/accounts/${bobAccountId}/posts/post-secret`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);
  });

  it('404s for a post id that does not exist', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/nope`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(404);
  });
});
