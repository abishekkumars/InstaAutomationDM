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

  // Any media id resolves. Zernio's own post id is deliberately a DIFFERENT value
  // (`zernio-<platformPostId>`) - these really are two different ids in Zernio's API, and a
  // fake returning the same value for both would hide a swap between them.
  async getPost(input: GetPostInput): Promise<InstagramPost | null> {
    return {
      zernioPostId: `zernio-${input.platformPostId}`,
      zernioAccountId: input.zernioAccountId,
      platformPostId: input.platformPostId,
      permalink: null,
      caption: '',
      mediaType: null,
      thumbnailUrl: null,
      publishedAt: null,
    };
  }

  async createCommentAutomation(input: CreateCommentAutomationInput): Promise<CommentAutomation> {
    this.lastCreateInput = input;
    // Keyed on the media id since Phase 17 - the pivot, and the only id a create is guaranteed
    // to carry now that `postId` is omitted for posts Zernio has not synced.
    if (this.postsWithAutomation.has(input.platformPostId)) {
      throw new ZernioApiError('POST', '/comment-automations', 409, {
        error: 'Active per-post automation already exists',
      });
    }
    this.automationCounter += 1;
    this.postsWithAutomation.add(input.platformPostId);
    const automation: CommentAutomation = {
      zernioAutomationId: `fake-automation-${this.automationCounter}`,
      zernioAccountId: input.zernioAccountId,
      zernioPostId: input.zernioPostId ?? null,
      platformPostId: input.platformPostId,
      name: input.name,
      keywords: input.keywords,
      matchMode: input.matchMode,
      // Echoed back with Zernio's own defaults applied, the same way the real API does: an
      // omitted audience means 'any', and omitted variations mean none.
      audience: input.audience ?? 'any',
      commentReply: input.commentReply ?? null,
      commentReplyVariations: input.commentReplyVariations ?? [],
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
    platformPostId: string,
    remote?: Omit<Partial<CommentAutomation>, 'stats'> & {
      zernioAccountId: string;
      stats?: CommentAutomation['stats'];
    },
  ): void {
    this.postsWithAutomation.add(platformPostId);
    if (remote) {
      this.automationCounter += 1;
      this.remoteAutomations.push({
        zernioAutomationId: `zernio-dashboard-${this.automationCounter}`,
        // Zernio may or may not know its own post id for this automation; the media id is the
        // one always present, and the one reconciliation matches on since Phase 17.
        zernioPostId: `zernio-${platformPostId}`,
        platformPostId,
        name: 'Made in Zernio',
        keywords: ['price'],
        matchMode: 'contains',
        audience: 'any',
        commentReplyVariations: [],
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
    if (removed?.platformPostId) {
      this.postsWithAutomation.delete(removed.platformPostId);
    }
  }

  // Present only to satisfy InstagramProvider's contract. Neither is exercised here - the
  // organization-delete path that uses them is covered in admin.e2e.test.ts.
  disconnectedAccounts: string[] = [];
  deletedProfiles: string[] = [];

  async disconnectAccount(input: { zernioAccountId: string }): Promise<void> {
    this.disconnectedAccounts.push(input.zernioAccountId);
  }

  async deleteProfile(input: { zernioProfileId: string }): Promise<void> {
    this.deletedProfiles.push(input.zernioProfileId);
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
    this.lastUpdateInput = undefined;
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
      platformPostId: 'post-1',
      name: 'Watch giveaway',
      keywords: ['LINK', 'link', 'price'],
      matchMode: 'CONTAINS',
      commentReply: 'Check your DMs!',
      dmMessage: 'Here is the link you asked for!',
      isActive: true,
    });
    expect(fakeProvider.lastCreateInput?.keywords).toEqual(['LINK', 'link', 'price']);
    // Zernio's `platformPostId` means Instagram's media id - the id an incoming comment
    // actually carries, and the route's own `:postId` segment since Phase 17.
    expect(fakeProvider.lastCreateInput?.platformPostId).toBe('post-1');
    // `postId` (Zernio's own `_id`) is deliberately NOT sent. Verified against the live API on
    // 2026-08-19: omitting it still creates a working automation, which is the only reason a
    // reel Zernio has not synced yet can be automated at all. Asserting its absence keeps a
    // well-meaning "resolve the Zernio id first" change from silently reintroducing the block.
    expect(fakeProvider.lastCreateInput?.zernioPostId).toBeUndefined();

    const stored = await prisma.automation.findFirst({ where: { platformPostId: 'post-1' } });
    expect(stored?.keywords).toEqual(['LINK', 'link', 'price']);
    expect(stored?.organizationId).toBe(organization.id);
  });

  // Phase 16.2, requirement 12 deliberately REVERSED this. An empty keyword list used to be
  // rejected, because specific-keyword was the only trigger there was. It is now the
  // "Any comments" trigger, and Zernio's own spec says an empty list means every comment fires
  // the automation - so rejecting it would block a supported configuration.
  it('accepts an empty keyword list as the "any comment" trigger', async () => {
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
      .send({ ...AUTOMATION_BODY, keywords: [] })
      .expect(201);

    expect(response.body.keywords).toEqual([]);

    // And the empty list reached Zernio as an empty list, rather than being dropped from the
    // request body - an omitted `keywords` key would mean something different to Zernio than an
    // explicitly empty one.
    expect(fakeProvider.lastCreateInput?.keywords).toEqual([]);
  });

  it('defaults the audience to "any" and accepts a follower restriction', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    const path = `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts`;

    const defaulted = await request(app.getHttpServer())
      .post(`${path}/post-1/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(201);
    expect(defaulted.body.audience).toBe('ANY');

    const restricted = await request(app.getHttpServer())
      .post(`${path}/post-2/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ ...AUTOMATION_BODY, audience: 'follower' })
      .expect(201);
    expect(restricted.body.audience).toBe('FOLLOWER');
    expect(fakeProvider.lastCreateInput?.audience).toBe('follower');
  });

  it('persists up to five rotating public replies', async () => {
    const { user, organization } = await createOrgWithOwner('alice@example.com');
    const { accountId } = await connectAndConfirmAccount(
      app,
      user,
      organization,
      'ig-acct-1',
      'acme_ig',
    );
    const path = `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts`;

    const response = await request(app.getHttpServer())
      .post(`${path}/post-1/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({
        ...AUTOMATION_BODY,
        commentReply: 'Sent!',
        commentReplyVariations: ['On its way!', 'Just DMed you.'],
      })
      .expect(201);

    expect(response.body.commentReplyVariations).toEqual(['On its way!', 'Just DMed you.']);

    // Six alternates is one past Zernio's own maxItems of 5.
    await request(app.getHttpServer())
      .post(`${path}/post-2/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({
        ...AUTOMATION_BODY,
        commentReply: 'Sent!',
        commentReplyVariations: ['a', 'b', 'c', 'd', 'e', 'f'],
      })
      .expect(400);

    // Alternates with no primary reply have nothing to rotate against. `commentReply` is
    // explicitly stripped here - AUTOMATION_BODY carries one, so spreading it alone would not
    // actually produce the orphaned case this is meant to cover.
    const bodyWithoutReply = { ...AUTOMATION_BODY, commentReply: undefined };
    await request(app.getHttpServer())
      .post(`${path}/post-3/automations`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ ...bodyWithoutReply, commentReplyVariations: ['orphan'] })
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

    const stored = await prisma.automation.findFirst({ where: { platformPostId: 'post-1' } });
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
    expect(stored[0]).toMatchObject({ name: 'Made in Zernio', platformPostId: 'post-1' });
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
      platformPostId: 'post-1',
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
        zernioPostId: 'zernio-post-1',
        zernioAccountId: 'ig-acct-1',
        // Must match the automation's own platformPostId - the dashboard's thumbnail lookup is
        // keyed on the media id since Phase 17, not on Zernio's post id.
        platformPostId: 'post-1',
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
      platformPostId: 'post-2',
      instagramAccountId: accountA,
      accountUsername: 'studio_a',
    });
    expect(response.body[1]).toMatchObject({
      platformPostId: 'post-1',
      instagramAccountId: accountA,
    });
  });
});

// Creates one automation and returns everything the edit/delete routes need to address it.
// Both routes are org-scoped (`/organizations/:organizationId/automations/:automationId`) rather
// than post-scoped, because the automation's own id already identifies it uniquely and the
// dashboard table has no post in its route.
async function createAutomation(
  email: string,
  zernioAccountId = 'ig-acct-1',
  body: Record<string, unknown> = AUTOMATION_BODY,
) {
  const { user, organization } = await createOrgWithOwner(email);
  const { accountId } = await connectAndConfirmAccount(
    app,
    user,
    organization,
    zernioAccountId,
    'acme_ig',
  );
  const response = await request(app.getHttpServer())
    .post(
      `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
    )
    .set('Authorization', bearerFor(user.id, user.email))
    .send(body)
    .expect(201);
  return {
    user,
    organization,
    accountId,
    automationId: response.body.id as string,
  };
}

describe('PATCH /organizations/:organizationId/automations/:automationId', () => {
  it('rejects a request with no bearer token', async () => {
    const { organization, automationId } = await createAutomation('alice@example.com');
    await request(app.getHttpServer())
      .patch(`/api/organizations/${organization.id}/automations/${automationId}`)
      .send({ name: 'Renamed' })
      .expect(401);
  });

  it('404s for a caller who is not a member of the organization', async () => {
    const { organization, automationId } = await createAutomation('alice@example.com');
    const bob = await prisma.user.create({ data: { email: 'bob@example.com' } });

    await request(app.getHttpServer())
      .patch(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .send({ name: 'Renamed' })
      .expect(404);
  });

  it('404s for an automationId that belongs to a different organization', async () => {
    // The tenant-isolation guard: the id comes from the client, so owning it is never assumed
    // from the id alone - it is re-checked against the organization the session resolves to.
    // 404 rather than 403, so an outsider cannot use the response to confirm the id exists.
    const { automationId: aliceAutomationId } = await createAutomation(
      'alice@example.com',
      'ig-acct-alice',
    );
    const { user: bob, organization: bobOrg } = await createOrgWithOwner('bob@example.com');

    await request(app.getHttpServer())
      .patch(`/api/organizations/${bobOrg.id}/automations/${aliceAutomationId}`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .send({ name: 'Stolen' })
      .expect(404);

    const stored = await prisma.automation.findUnique({ where: { id: aliceAutomationId } });
    expect(stored?.name).toBe(AUTOMATION_BODY.name);
  });

  it('applies a partial update and leaves unsent fields untouched', async () => {
    const { user, organization, automationId } = await createAutomation('alice@example.com');

    const response = await request(app.getHttpServer())
      .patch(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ name: 'Renamed', isActive: false })
      .expect(200);

    expect(response.body).toMatchObject({
      name: 'Renamed',
      isActive: false,
      // Untouched by this request, so they must survive it - Zernio's PATCH leaves absent keys
      // alone, and the local write-back must not flatten them to defaults.
      keywords: AUTOMATION_BODY.keywords,
      dmMessage: AUTOMATION_BODY.dmMessage,
      commentReply: AUTOMATION_BODY.commentReply,
    });
    expect(fakeProvider.lastUpdateInput?.keywords).toBeUndefined();

    const stored = await prisma.automation.findUnique({ where: { id: automationId } });
    expect(stored).toMatchObject({ name: 'Renamed', isActive: false });
    expect(stored?.dmMessage).toBe(AUTOMATION_BODY.dmMessage);
  });

  it('rejects an empty body rather than making a no-op round trip to Zernio', async () => {
    const { user, organization, automationId } = await createAutomation('alice@example.com');

    await request(app.getHttpServer())
      .patch(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({})
      .expect(400);

    expect(fakeProvider.lastUpdateInput).toBeUndefined();
  });

  it('clears every button when sent an empty array', async () => {
    // The regression guard for using Prisma.DbNull rather than undefined on the write-back.
    // `undefined` means "leave this column alone" to Prisma, so clearing the buttons would have
    // succeeded on Zernio and silently done nothing locally - the row would keep rendering
    // buttons the automation no longer has.
    const { user, organization, automationId } = await createAutomation(
      'alice@example.com',
      'ig-acct-1',
      { ...AUTOMATION_BODY, buttons: [{ title: 'Shop now', url: 'https://example.com/shop' }] },
    );
    const before = await prisma.automation.findUnique({ where: { id: automationId } });
    expect(before?.buttons).toEqual([{ title: 'Shop now', url: 'https://example.com/shop' }]);

    const response = await request(app.getHttpServer())
      .patch(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ buttons: [] })
      .expect(200);

    expect(response.body.buttons).toEqual([]);
    // `[]` must reach Zernio as an explicit value - dropping it as "empty" would mean the
    // buttons are never actually removed upstream either.
    expect(fakeProvider.lastUpdateInput?.buttons).toEqual([]);

    const stored = await prisma.automation.findUnique({ where: { id: automationId } });
    expect(stored?.buttons ?? null).toBeNull();
  });

  it('rejects a 641-character dmMessage against buttons that are only in the stored row', async () => {
    // updateAutomationSchema cannot catch this on its own: a partial update need not send
    // `buttons` and `dmMessage` together, so with only dmMessage present the schema sees no
    // buttons and lets it through. The service re-checks against the stored row, which is the
    // only place the post-patch picture exists. Without that check this reaches Zernio and
    // comes back as an opaque 400.
    const { user, organization, automationId } = await createAutomation(
      'alice@example.com',
      'ig-acct-1',
      { ...AUTOMATION_BODY, buttons: [{ title: 'Shop now', url: 'https://example.com/shop' }] },
    );

    await request(app.getHttpServer())
      .patch(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ dmMessage: 'x'.repeat(641) })
      .expect(400);

    expect(fakeProvider.lastUpdateInput).toBeUndefined();
  });

  it('allows a 641-character dmMessage once the buttons are removed in the same request', async () => {
    // The mirror of the test above: the same message length is fine when the patch itself
    // clears the buttons, proving the check reads the post-patch state rather than just the
    // stored row.
    const { user, organization, automationId } = await createAutomation(
      'alice@example.com',
      'ig-acct-1',
      { ...AUTOMATION_BODY, buttons: [{ title: 'Shop now', url: 'https://example.com/shop' }] },
    );

    await request(app.getHttpServer())
      .patch(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ dmMessage: 'x'.repeat(641), buttons: [] })
      .expect(200);
  });

  it('404s without deleting the local row when Zernio no longer has the automation', async () => {
    const { user, organization, automationId } = await createAutomation('alice@example.com');
    const stored = await prisma.automation.findUniqueOrThrow({ where: { id: automationId } });
    // Deleted directly in Zernio's own dashboard, leaving our row pointing at nothing.
    await fakeProvider.deleteCommentAutomation({
      zernioAutomationId: stored.zernioAutomationId,
    });

    await request(app.getHttpServer())
      .patch(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ name: 'Renamed' })
      .expect(404);

    // Deliberately NOT self-healed by deleting the row: dropping a user's configuration as a
    // side effect of a failed edit is worse than a stale row, which reconciliation can resolve.
    expect(await prisma.automation.count()).toBe(1);
  });
});

describe('DELETE /organizations/:organizationId/automations/:automationId', () => {
  it('rejects a request with no bearer token', async () => {
    const { organization, automationId } = await createAutomation('alice@example.com');
    await request(app.getHttpServer())
      .delete(`/api/organizations/${organization.id}/automations/${automationId}`)
      .expect(401);
    expect(await prisma.automation.count()).toBe(1);
  });

  it('404s for an automationId that belongs to a different organization', async () => {
    const { automationId: aliceAutomationId } = await createAutomation(
      'alice@example.com',
      'ig-acct-alice',
    );
    const { user: bob, organization: bobOrg } = await createOrgWithOwner('bob@example.com');

    await request(app.getHttpServer())
      .delete(`/api/organizations/${bobOrg.id}/automations/${aliceAutomationId}`)
      .set('Authorization', bearerFor(bob.id, bob.email))
      .expect(404);

    expect(await prisma.automation.count()).toBe(1);
  });

  it('deletes on Zernio and locally, and frees the post for a new automation', async () => {
    const { user, organization, accountId, automationId } =
      await createAutomation('alice@example.com');

    await request(app.getHttpServer())
      .delete(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(204);

    expect(await prisma.automation.count()).toBe(0);
    // Gone upstream too, not just locally - otherwise the automation would keep firing while
    // appearing deleted, and creating a replacement would 409 forever.
    expect(await fakeProvider.listCommentAutomations()).toHaveLength(0);
    await request(app.getHttpServer())
      .post(
        `/api/organizations/${organization.id}/instagram/accounts/${accountId}/posts/post-1/automations`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .send(AUTOMATION_BODY)
      .expect(201);
  });

  it('still removes the local row when Zernio reports the automation is already gone', async () => {
    // The opposite call from update's 404 handling, and deliberately so: here removing the row
    // is exactly what the user asked for, so Zernio having none means the desired end state is
    // already half-reached - not that the request is bad. Failing would leave a row the user
    // can see but can never delete.
    const { user, organization, automationId } = await createAutomation('alice@example.com');
    const stored = await prisma.automation.findUniqueOrThrow({ where: { id: automationId } });
    await fakeProvider.deleteCommentAutomation({
      zernioAutomationId: stored.zernioAutomationId,
    });

    await request(app.getHttpServer())
      .delete(`/api/organizations/${organization.id}/automations/${automationId}`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(204);

    expect(await prisma.automation.count()).toBe(0);
  });
});
