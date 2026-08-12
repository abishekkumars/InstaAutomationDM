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
  type DeleteCommentAutomationInput,
  type EnsureProfileResult,
  type GetPostInput,
  type FindConnectedAccountInput,
  type GetConnectUrlInput,
  type GetConnectUrlResult,
  type InstagramPost,
  type ListPostsInput,
  type InstagramProvider,
  type ListPostsResult,
  type UpdateCommentAutomationInput,
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
    return { zernioProfileId: `fake-profile-${this.profileCounter}`, reused: false };
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

  // Returns whatever posts have been registered for the account, so the dashboard's thumbnail
  // lookup (which goes through listPosts, not getPost) has something real to resolve against.
  private postsByAccount = new Map<string, InstagramPost[]>();

  setPosts(zernioAccountId: string, posts: InstagramPost[]): void {
    this.postsByAccount.set(zernioAccountId, posts);
  }

  async listPosts(input: ListPostsInput): Promise<ListPostsResult> {
    const posts = this.postsByAccount.get(input.zernioAccountId) ?? [];
    return {
      posts,
      pagination: { page: 1, limit: input.limit, total: posts.length, pages: 1 },
    };
  }

  // Any post id resolves, and its Instagram media id is deliberately DIFFERENT from Zernio's
  // own post id (`ig-media-<zernioPostId>`) - these really are two different ids in Zernio's
  // API, and a fake that returned the same value for both would hide a swap between them.
  async getPost(input: GetPostInput): Promise<InstagramPost | null> {
    return {
      zernioPostId: input.zernioPostId,
      zernioAccountId: input.zernioAccountId,
      platformPostId: `ig-media-${input.zernioPostId}`,
      permalink: null,
      caption: '',
      mediaType: null,
      thumbnailUrl: null,
      publishedAt: null,
    };
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
    const automation: CommentAutomation = {
      zernioAutomationId: `fake-automation-${this.automationCounter}`,
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
      // Non-zero, and with trackedSends deliberately LOWER than dmsSent (which is how Zernio's
      // real data behaves - only DMs carrying a tracked link count), so a CTR computed against
      // the wrong denominator produces a different number and the test catches it.
      stats: {
        triggered: 12,
        dmsSent: 10,
        dmsFailed: 1,
        uniqueContacts: 9,
        trackedSends: 8,
        linkClicks: 2,
        uniqueClicks: 2,
      },
    };
    this.remoteAutomations.push(automation);
    return automation;
  }

  // Automations that exist on Zernio's side, which is what listCommentAutomations returns.
  private remoteAutomations: CommentAutomation[] = [];

  // Simulates a per-post automation that already exists on Zernio's side (e.g. created
  // directly in Zernio's own dashboard) without this app's database knowing about it.
  simulateExistingZernioAutomation(
    zernioPostId: string,
    remote?: Omit<Partial<CommentAutomation>, 'stats'> & {
      zernioAccountId: string;
      stats?: CommentAutomation['stats'];
    },
  ): void {
    this.postsWithAutomation.add(zernioPostId);
    if (remote) {
      this.automationCounter += 1;
      this.remoteAutomations.push({
        zernioAutomationId: `zernio-dashboard-${this.automationCounter}`,
        zernioPostId,
        platformPostId: `ig-media-${zernioPostId}`,
        name: 'Made in Zernio',
        keywords: ['price'],
        matchMode: 'contains',
        stats: null,
        commentReply: null,
        buttons: [],
        dmMessage: 'Here is the link',
        isActive: true,
        ...remote,
      });
    }
  }

  /** Simulates Zernio being unreachable for the stats lookup specifically. */
  failListCommentAutomations = false;

  async listCommentAutomations(): Promise<CommentAutomation[]> {
    if (this.failListCommentAutomations) {
      throw new ZernioApiError('GET', '/comment-automations', 503, { error: 'unavailable' });
    }
    return this.remoteAutomations;
  }

  lastUpdateInput: UpdateCommentAutomationInput | undefined;

  // Mutates the stored remote automation the way Zernio's own PATCH does: only the fields
  // actually present in the request change, so a test that sends a partial body can assert
  // the untouched fields really were left alone.
  async updateCommentAutomation(input: UpdateCommentAutomationInput): Promise<CommentAutomation> {
    this.lastUpdateInput = input;
    const existing = this.remoteAutomations.find(
      (automation) => automation.zernioAutomationId === input.zernioAutomationId,
    );
    if (!existing) {
      throw new ZernioApiError('PATCH', '/comment-automations/x', 404, { error: 'not found' });
    }
    if (input.name !== undefined) existing.name = input.name;
    if (input.keywords !== undefined) existing.keywords = input.keywords;
    if (input.matchMode !== undefined) existing.matchMode = input.matchMode;
    if (input.commentReply !== undefined) existing.commentReply = input.commentReply || null;
    if (input.buttons !== undefined) existing.buttons = input.buttons;
    if (input.dmMessage !== undefined) existing.dmMessage = input.dmMessage;
    if (input.isActive !== undefined) existing.isActive = input.isActive;
    return existing;
  }

  async deleteCommentAutomation(input: DeleteCommentAutomationInput): Promise<void> {
    const index = this.remoteAutomations.findIndex(
      (automation) => automation.zernioAutomationId === input.zernioAutomationId,
    );
    if (index === -1) {
      throw new ZernioApiError('DELETE', '/comment-automations/x', 404, { error: 'not found' });
    }
    const removed = this.remoteAutomations.splice(index, 1)[0];
    // Frees the post so a later create for the same post succeeds, matching Zernio's real
    // behaviour (its one-active-automation-per-post rule only counts existing automations).
    if (removed?.zernioPostId) {
      this.postsWithAutomation.delete(removed.zernioPostId);
    }
  }

  reset(): void {
    this.failListCommentAutomations = false;
    this.postsByAccount.clear();
    this.profileCounter = 0;
    this.connectedByProfile.clear();
    this.automationCounter = 0;
    this.postsWithAutomation.clear();
    this.remoteAutomations = [];
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
    // The two post ids must go to their own fields, not be swapped: Zernio's `platformPostId`
    // means Instagram's media id, while its `postId` means Zernio's own post id. Sending
    // Zernio's `_id` as `platformPostId` (the original bug) produces an automation scoped to
    // an id Instagram never reports on an incoming comment, so it can never fire.
    expect(fakeProvider.lastCreateInput?.zernioPostId).toBe('post-1');
    expect(fakeProvider.lastCreateInput?.platformPostId).toBe('ig-media-post-1');

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
    fakeProvider.simulateExistingZernioAutomation('post-1', { zernioAccountId: 'ig-acct-1' });

    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(409);

    // Still a 409 (we did NOT create a second automation on Zernio), but the pre-existing one
    // is now backfilled locally instead of staying invisible - otherwise the post page shows
    // "No automation yet" plus a create button that can only ever 409.
    const stored = await prisma.automation.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'Made in Zernio', zernioPostId: 'post-1' });
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

  it('lists an automation that exists only on Zernio, and backfills it locally', async () => {
    // The reported bug: automations created directly in Zernio's dashboard (or by a request
    // whose local insert failed after the Zernio call succeeded) were invisible here, because
    // this endpoint only ever read our own table. Zernio is the system of record.
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    fakeProvider.simulateExistingZernioAutomation('post-1', { zernioAccountId: 'ig-acct-1' });
    expect(await prisma.automation.count()).toBe(0);

    const response = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ name: 'Made in Zernio', keywords: ['price'] });
    // Backfilled, so the org-wide dashboard list sees it too - not just re-fetched every time.
    expect(await prisma.automation.count()).toBe(1);
  });

  it('does not adopt a Zernio automation belonging to a different connected account', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    // Same post id, but the automation is scoped to a different Instagram account.
    fakeProvider.simulateExistingZernioAutomation('post-1', { zernioAccountId: 'ig-acct-other' });

    const response = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body).toEqual([]);
    expect(await prisma.automation.count()).toBe(0);
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

  it('enriches each row with live Zernio stats and the post thumbnail', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    fakeProvider.setPosts('ig-acct-1', [
      {
        zernioPostId: 'post-1',
        zernioAccountId: 'ig-acct-1',
        platformPostId: 'ig-media-post-1',
        permalink: 'https://instagram.com/p/abc',
        caption: 'Handmade tote reel',
        mediaType: 'video',
        thumbnailUrl: 'https://cdn.example.test/thumb.jpg',
        publishedAt: null,
      },
    ]);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].stats).toEqual({
      dmsSent: 10,
      linkClicks: 2,
      // 2 clicks / 8 trackedSends = 25%. Using dmsSent (10) as the denominator would give
      // 20%, so this assertion is the guard against the wrong denominator - Zernio's own spec
      // is explicit that trackedSends is the correct one.
      clickThroughRate: 25,
    });
    expect(response.body[0].post).toEqual({
      caption: 'Handmade tote reel',
      thumbnailUrl: 'https://cdn.example.test/thumb.jpg',
      permalink: 'https://instagram.com/p/abc',
    });
  });

  it('returns null stats rather than zeros when Zernio cannot be reached', async () => {
    // A stats fetch failure must not read as "this automation has sent nothing" - the
    // dashboard renders a dash for null, and 0 would be a fabricated number.
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

    fakeProvider.failListCommentAutomations = true;

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].stats).toBeNull();
    // The row itself still renders - a stats outage degrades the dashboard, never breaks it.
    expect(response.body[0].name).toBe(AUTOMATION_BODY.name);
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
