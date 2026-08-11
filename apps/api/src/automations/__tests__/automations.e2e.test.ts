import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma } from '@automationdm/database';
import { signInternalServiceToken } from '@automationdm/shared';
import {
  ZernioApiError,
  type CommentAutomation,
  type ConnectedInstagramAccount,
  type CreateCommentAutomationInput,
  type EnsureProfileResult,
  type FindConnectedAccountInput,
  type GetConnectUrlInput,
  type GetConnectUrlResult,
  type InstagramPost,
  type InstagramProvider,
  type ListPostsResult,
} from '@automationdm/zernio';
import { AppModule } from '../../app.module';
import { INSTAGRAM_PROVIDER } from '../../instagram/instagram-provider.token';

const INTERNAL_SECRET = process.env.API_INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error('API_INTERNAL_SECRET must be set (see .env) to run this test file.');
}

function bearerFor(userId: string, email: string): string {
  return `Bearer ${signInternalServiceToken({ sub: userId, email }, INTERNAL_SECRET as string)}`;
}

// A fake, in-memory InstagramProvider - never a live Zernio call, per docs/TESTING.md.
// createCommentAutomation lets tests simulate Zernio's real 409 (an active per-post
// automation already exists), including the case where Zernio already has one that this
// app's own database doesn't know about yet.
class FakeInstagramProvider implements InstagramProvider {
  private profileCounter = 0;
  private connectedByProfile = new Map<string, ConnectedInstagramAccount>();
  private automationCounter = 0;
  private postsWithAutomation = new Set<string>();
  lastCreateInput: CreateCommentAutomationInput | undefined;

  async ensureProfile(): Promise<EnsureProfileResult> {
    this.profileCounter += 1;
    return { zernioProfileId: `fake-profile-${this.profileCounter}` };
  }

  async getConnectUrl(input: GetConnectUrlInput): Promise<GetConnectUrlResult> {
    return { authUrl: `https://fake-zernio.test/oauth?profileId=${input.zernioProfileId}` };
  }

  async findConnectedAccount(
    input: FindConnectedAccountInput,
  ): Promise<ConnectedInstagramAccount | null> {
    return this.connectedByProfile.get(input.zernioProfileId) ?? null;
  }

  setConnectedAccount(zernioProfileId: string, account: ConnectedInstagramAccount): void {
    this.connectedByProfile.set(zernioProfileId, account);
  }

  async listPosts(): Promise<ListPostsResult> {
    return { posts: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 } };
  }

  async getPost(): Promise<InstagramPost | null> {
    return null;
  }

  async createCommentAutomation(input: CreateCommentAutomationInput): Promise<CommentAutomation> {
    this.lastCreateInput = input;
    if (this.postsWithAutomation.has(input.zernioPostId)) {
      throw new ZernioApiError('POST', '/comment-automations', 409, {
        error: 'Active per-post automation already exists',
      });
    }
    this.automationCounter += 1;
    this.postsWithAutomation.add(input.zernioPostId);
    return {
      zernioAutomationId: `fake-automation-${this.automationCounter}`,
      zernioAccountId: input.zernioAccountId,
      zernioPostId: input.zernioPostId,
      name: input.name,
      keywords: input.keywords,
      matchMode: input.matchMode,
      commentReply: input.commentReply ?? null,
      buttons: input.buttons ?? [],
      dmMessage: input.dmMessage,
      isActive: true,
    };
  }

  // Simulates a per-post automation that already exists on Zernio's side (e.g. created
  // directly in Zernio's own dashboard) without this app's database knowing about it.
  simulateExistingZernioAutomation(zernioPostId: string): void {
    this.postsWithAutomation.add(zernioPostId);
  }

  // Not exercised by this file's own tests yet (Phase 10.3 will use this for live stats) -
  // present only to satisfy InstagramProvider's contract.
  async listCommentAutomations(): Promise<CommentAutomation[]> {
    return [];
  }

  reset(): void {
    this.profileCounter = 0;
    this.connectedByProfile.clear();
    this.automationCounter = 0;
    this.postsWithAutomation.clear();
    this.lastCreateInput = undefined;
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

// Same full-reset approach as the instagram/organizations e2e tests - a throwaway local dev
// database.
beforeEach(async () => {
  await prisma.automation.deleteMany();
  await prisma.instagramAccount.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
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
  return { accountId: callbackResponse.body.id as string };
}

const AUTOMATION_BODY = {
  name: 'Watch giveaway',
  keywords: ['LINK', 'link', 'price'],
  matchMode: 'contains',
  commentReply: 'Check your DMs!',
  dmMessage: 'Here is the link you asked for!',
};

describe('POST .../instagram/accounts/:accountId/posts/:postId/automations', () => {
  it('rejects a request with no bearer token', async () => {
    const { organization } = await createOrgWithOwner('alice@example.com');
    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/accounts/x/posts/post-1/automations`)
      .send(AUTOMATION_BODY)
      .expect(401);
  });

  it('404s for a caller who is not a member of the organization', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(bob.id, bob.email))
      .send(AUTOMATION_BODY)
      .expect(404);
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

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${bobOrg.id}/instagram/accounts/${aliceAccountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(bob.id, bob.email))
      .send(AUTOMATION_BODY)
      .expect(404);
  });

  it('creates an automation with multiple keywords and persists it', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    const response = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(201);

    expect(response.body).toMatchObject({
      zernioPostId: 'post-1',
      name: 'Watch giveaway',
      keywords: ['LINK', 'link', 'price'],
      matchMode: 'CONTAINS',
      commentReply: 'Check your DMs!',
      dmMessage: 'Here is the link you asked for!',
      isActive: true,
    });
    expect(fakeProvider.lastCreateInput?.keywords).toEqual(['LINK', 'link', 'price']);

    const stored = await prisma.automation.findFirst({ where: { zernioPostId: 'post-1' } });
    expect(stored?.keywords).toEqual(['LINK', 'link', 'price']);
    expect(stored?.organizationId).toBe(organization.id);
  });

  it('rejects a request with no keywords', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ ...AUTOMATION_BODY, keywords: [] })
      .expect(400);
  });

  it('creates an automation with buttons and persists them', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    const response = await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send({
        ...AUTOMATION_BODY,
        buttons: [
          { title: 'Shop now', url: 'https://example.com/shop' },
          { title: 'Sizing', url: 'https://example.com/sizing' },
        ],
      })
      .expect(201);

    expect(response.body.buttons).toEqual([
      { title: 'Shop now', url: 'https://example.com/shop' },
      { title: 'Sizing', url: 'https://example.com/sizing' },
    ]);
    expect(fakeProvider.lastCreateInput?.buttons).toEqual([
      { title: 'Shop now', url: 'https://example.com/shop' },
      { title: 'Sizing', url: 'https://example.com/sizing' },
    ]);

    const stored = await prisma.automation.findFirst({ where: { zernioPostId: 'post-1' } });
    expect(stored?.buttons).toEqual([
      { title: 'Shop now', url: 'https://example.com/shop' },
      { title: 'Sizing', url: 'https://example.com/sizing' },
    ]);
  });

  it('rejects more than 3 buttons', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send({
        ...AUTOMATION_BODY,
        buttons: [
          { title: 'One', url: 'https://example.com/1' },
          { title: 'Two', url: 'https://example.com/2' },
          { title: 'Three', url: 'https://example.com/3' },
          { title: 'Four', url: 'https://example.com/4' },
        ],
      })
      .expect(400);
  });

  it('rejects a dmMessage over 640 characters when buttons are attached', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send({
        ...AUTOMATION_BODY,
        buttons: [{ title: 'Shop now', url: 'https://example.com/shop' }],
        dmMessage: 'x'.repeat(641),
      })
      .expect(400);
  });

  it('rejects a second automation for the same post (local pre-check)', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(409);
  });

  it('rejects when Zernio already has an automation for this post that our database does not know about', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    fakeProvider.simulateExistingZernioAutomation('post-1');

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(409);

    expect(await prisma.automation.count()).toBe(0);
  });
});

describe('GET .../instagram/accounts/:accountId/posts/:postId/automations', () => {
  it('returns an empty array when no automation exists yet, and 404s for a non-member', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );

    const response = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);
    expect(response.body).toEqual([]);

    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });
    await request(app.getHttpServer())
      .get(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);
  });

  it('lists the automation for a post after it is created', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      zernioPostId: 'post-1',
      keywords: AUTOMATION_BODY.keywords,
    });
  });
});

describe('GET .../organizations/:organizationId/automations', () => {
  it('rejects a request with no bearer token', async () => {
    const { organization } = await createOrgWithOwner('alice@example.com');
    await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/automations`)
      .expect(401);
  });

  it('404s for a caller who is not a member of the organization', async () => {
    const { organization } = await createOrgWithOwner('alice@example.com');
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/automations`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);
  });

  it('returns an empty array for an org with no automations yet', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);
    expect(response.body).toEqual([]);
  });

  it('lists automations across every connected account in the org, newest first, scoped to that org only', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId: accountA } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-a',
      'studio_a',
    );

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountA}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountA}/posts/post-2/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ ...AUTOMATION_BODY, name: 'Restock alert', keywords: ['restock'] })
      .expect(201);

    const { organization: otherOrg, user: otherUser } = await createOrgWithOwner('bob@example.com');
    const { accountId: otherAccount } = await connectAndConfirmAccount(
      app,
      otherUser,
      otherOrg,
      'ig-acct-other',
      'someone_else',
    );
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${otherOrg.id}/instagram/accounts/${otherAccount}/posts/post-other-1/automations`,
      )
      .set('Authorization', bearerFor(otherUser.id, otherUser.email))
      .send(AUTOMATION_BODY)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject({
      name: 'Restock alert',
      zernioPostId: 'post-2',
      instagramAccountId: accountA,
      accountUsername: 'studio_a',
    });
    expect(response.body[1]).toMatchObject({
      zernioPostId: 'post-1',
      instagramAccountId: accountA,
    });
  });
});
