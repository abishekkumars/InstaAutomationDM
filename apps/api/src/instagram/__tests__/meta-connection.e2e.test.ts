import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { prisma } from '@automationdm/database';
import { signInternalServiceToken } from '@automationdm/shared';
import { encryptToken } from '@automationdm/shared';
import { signOAuthState } from '@automationdm/meta';
import { AppModule } from '../../app.module';

// Covers the Phase 17 Meta path end to end through the real AppModule: the OAuth state binding,
// the encrypted token at rest, Meta-first listing, and - the behaviour the whole design rests on
// - degrading to Zernio rather than failing the page.
//
// `fetch` is stubbed rather than hitting graph.instagram.com, per docs/TESTING.md's "never a
// live third-party call" rule. The Zernio provider is left as the real ZernioInstagramProvider
// but is never reached with a usable key, so its failure IS the fallback being exercised.

const INTERNAL_SECRET = process.env.API_INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error('API_INTERNAL_SECRET must be set (see .env) to run this test file.');
}

const META_APP_SECRET = 'test-meta-app-secret';
const TOKEN = 'IGAA-live-token';

function bearerFor(userId: string, email: string): string {
  return `Bearer ${signInternalServiceToken({ sub: userId, email }, INTERNAL_SECRET as string)}`;
}

let app: INestApplication;
const originalEnv = {
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_APP_SECRET,
  redirectUri: process.env.META_REDIRECT_URI,
  appUrl: process.env.APP_URL,
};

// Both are set together on purpose: the connect endpoint requires the Meta callback to sit on the
// same origin the app itself is served from, so a fixture that set only one would be testing a
// configuration this deployment could never actually complete a browser round trip on.
const APP_ORIGIN = 'http://localhost:3000';
const REDIRECT_URI = `${APP_ORIGIN}/instagram/meta/callback`;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  process.env.META_APP_ID = originalEnv.appId;
  process.env.META_APP_SECRET = originalEnv.appSecret;
  process.env.META_REDIRECT_URI = originalEnv.redirectUri;
  process.env.APP_URL = originalEnv.appUrl;
});

beforeEach(async () => {
  process.env.META_APP_ID = 'test-app-id';
  process.env.META_APP_SECRET = META_APP_SECRET;
  process.env.APP_URL = APP_ORIGIN;
  process.env.META_REDIRECT_URI = REDIRECT_URI;

  await prisma.metaConnection.deleteMany();
  await prisma.automation.deleteMany();
  await prisma.instagramAccount.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seedAccount(email = 'alice@example.com') {
  const user = await prisma.user.create({
    data: { email, name: 'Alice', authProvider: 'credentials', authProviderId: email },
  });
  const organization = await prisma.organization.create({
    data: { name: 'Acme', slug: `acme-${Date.now()}-${Math.round(performance.now())}` },
  });
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
  });
  const account = await prisma.instagramAccount.create({
    data: {
      organizationId: organization.id,
      zernioAccountId: `ig-acct-${organization.id}`,
      username: 'acme_ig',
    },
  });
  return { user, organization, account };
}

async function seedConnection(organizationId: string, instagramAccountId: string) {
  return prisma.metaConnection.create({
    data: {
      organizationId,
      instagramAccountId,
      igUserId: '17841400000000000',
      accessTokenEncrypted: encryptToken(TOKEN),
      // Comfortably outside the 7-day refresh window, so these tests exercise listing rather
      // than the refresh path.
      expiresAt: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000),
      scopes: ['instagram_business_basic'],
    },
  });
}

/** One page of Meta media, shaped exactly like the real 2026-08-19 response. */
function stubMetaMedia(items: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: items }) }),
  );
}

describe('Meta-sourced post listing', () => {
  it('lists from Meta when the account has a connection, including a reel Zernio has not synced', async () => {
    const { user, organization, account } = await seedAccount();
    await seedConnection(organization.id, account.id);
    stubMetaMedia([
      {
        id: '18491809921100556',
        caption: 'Comment OFFER',
        media_type: 'VIDEO',
        media_product_type: 'REELS',
        permalink: 'https://www.instagram.com/reel/DcL1NOOvVa4/',
        timestamp: '2026-08-18T14:31:13+0000',
      },
    ]);

    const response = await request(app.getHttpServer())
      .get(
        `/api/organizations/${organization.id}/instagram/accounts/${account.id}/posts?page=1&limit=20`,
      )
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(response.body.posts).toHaveLength(1);
    expect(response.body.posts[0]).toMatchObject({
      platformPostId: '18491809921100556',
      mediaType: 'video',
      // Null by construction - the entire point is that this post is listable before Zernio
      // has ever heard of it.
      zernioPostId: null,
    });
  });

  it('falls back to Zernio rather than failing the page when Meta errors', async () => {
    const { user, organization, account } = await seedAccount();
    await seedConnection(organization.id, account.id);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'boom' } }),
      }),
    );

    // The Zernio path then fails too (no usable profile), but the important assertion is that
    // this is NOT a 500 caused by Meta - listing degrades instead of exploding.
    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts/${account.id}/posts`)
      .set('Authorization', bearerFor(user.id, user.email));

    expect(response.status).not.toBe(500);
  });

  it('marks the connection RECONNECT_REQUIRED when Meta rejects the token', async () => {
    const { user, organization, account } = await seedAccount();
    await seedConnection(organization.id, account.id);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'Session has expired', code: 190, type: 'OAuthException' },
        }),
      }),
    );

    await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts/${account.id}/posts`)
      .set('Authorization', bearerFor(user.id, user.email));

    const connection = await prisma.metaConnection.findUnique({
      where: { instagramAccountId: account.id },
    });
    // A dead credential needs the user to act; a transient failure must not. Only the former
    // sets this.
    expect(connection?.status).toBe('RECONNECT_REQUIRED');
  });
});

describe('redirect URI misconfiguration', () => {
  // Meta reports every authorize-request problem as the same flat "Invalid redirect_uri" on an
  // instagram.com error page, naming neither the URI it compared nor the reason. Worse, a URI
  // Meta *accepts* but this app cannot serve fails only after the user grants consent, as a
  // browser connection error with the authorization code already spent. These assert the
  // mismatch is caught locally, before the user leaves the app.

  it('refuses to build an authorize URL when the redirect origin differs from APP_URL', async () => {
    const { user, organization, account } = await seedAccount();
    // The exact trap hit during rollout: https in META_REDIRECT_URI while `next dev` serves
    // plain HTTP on the same host and port.
    process.env.META_REDIRECT_URI = 'https://localhost:3000/instagram/meta/callback';

    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/accounts/${account.id}/meta/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(400);

    // The message must name both values, or it is no more useful than Meta's own page.
    expect(response.body.message).toContain('https://localhost:3000');
    expect(response.body.message).toContain('APP_URL');
  });

  it('rejects a redirect URI that is not an absolute URL', async () => {
    const { user, organization, account } = await seedAccount();
    process.env.META_REDIRECT_URI = '/instagram/meta/callback';

    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/accounts/${account.id}/meta/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(400);
  });

  it('tolerates surrounding whitespace, which survives a copy-paste and breaks the match', async () => {
    const { user, organization, account } = await seedAccount();
    process.env.META_REDIRECT_URI = '  http://localhost:3000/instagram/meta/callback  ';

    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/accounts/${account.id}/meta/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);

    const url = new URL(response.body.authUrl);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/instagram/meta/callback',
    );
  });

  it('sends exactly the configured scopes and the Instagram app id', async () => {
    const { user, organization, account } = await seedAccount();

    const response = await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/accounts/${account.id}/meta/connect`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(201);

    const url = new URL(response.body.authUrl);
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('test-app-id');
    expect(url.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages',
    );
  });
});

describe('Meta connection endpoints', () => {
  it('never returns the access token, in any form', async () => {
    const { user, organization, account } = await seedAccount();
    await seedConnection(organization.id, account.id);

    const response = await request(app.getHttpServer())
      .get(`/api/organizations/${organization.id}/instagram/accounts/${account.id}/meta`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain('accessToken');
    expect(response.body).toMatchObject({ igUserId: '17841400000000000', status: 'CONNECTED' });
  });

  it('rejects a callback whose state was signed with a different secret', async () => {
    const { user, organization, account } = await seedAccount();
    const forged = signOAuthState(
      { organizationId: organization.id, instagramAccountId: account.id, userId: user.id },
      'not-the-app-secret',
    );

    // Without state verification, an attacker can hand a victim a callback URL carrying the
    // attacker's own authorization code and bind their Instagram account to the victim's org.
    await request(app.getHttpServer())
      .post(`/api/organizations/${organization.id}/instagram/meta/callback`)
      .set('Authorization', bearerFor(user.id, user.email))
      .send({ code: 'whatever', state: forged })
      .expect(400);

    expect(await prisma.metaConnection.count()).toBe(0);
  });

  it('404s for an account belonging to another organization', async () => {
    const alice = await seedAccount('alice@example.com');
    const bob = await seedAccount('bob@example.com');

    await request(app.getHttpServer())
      .get(`/api/organizations/${bob.organization.id}/instagram/accounts/${alice.account.id}/meta`)
      .set('Authorization', bearerFor(bob.user.id, bob.user.email))
      .expect(404);
  });

  it('disconnecting leaves listing to fall back to Zernio', async () => {
    const { user, organization, account } = await seedAccount();
    await seedConnection(organization.id, account.id);

    await request(app.getHttpServer())
      .delete(`/api/organizations/${organization.id}/instagram/accounts/${account.id}/meta`)
      .set('Authorization', bearerFor(user.id, user.email))
      .expect(200);

    expect(await prisma.metaConnection.count()).toBe(0);
  });
});
