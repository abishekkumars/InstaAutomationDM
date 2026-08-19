import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type InstagramAccountStatus } from '@automationdm/database';
import { instagramCallbackSchema, listInstagramPostsQuerySchema } from '@automationdm/validation';
import type { InstagramPost, InstagramProvider, ListPostsResult } from '@automationdm/zernio';
import { MetaApiError, type MetaInstagramClient, type MetaPost } from '@automationdm/meta';
import { PrismaService } from '../database/prisma.service';
import { getAppUrl } from '../config/app-url';
import { INSTAGRAM_PROVIDER } from './instagram-provider.token';
import { MetaConnectionService } from './meta-connection.service';

/** Maps a Meta media object into the shared domain shape the UI already renders.
 *
 * `zernioPostId` is null by construction: a post read from Meta has no Zernio `_id` until
 * Zernio's own sync catches up, which is precisely the lag this path exists to bypass. Nothing
 * downstream needs it - the pivot is `platformPostId`. */
function metaPostToInstagramPost(post: MetaPost, zernioAccountId: string): InstagramPost {
  return {
    zernioPostId: null,
    zernioAccountId,
    platformPostId: post.platformPostId,
    permalink: post.permalink,
    caption: post.caption,
    mediaType: post.mediaType,
    thumbnailUrl: post.thumbnailUrl,
    publishedAt: post.publishedAt,
  };
}

export interface InstagramAccountSummary {
  id: string;
  zernioAccountId: string;
  username: string | null;
  status: InstagramAccountStatus;
}

/** Result of POST .../instagram/connect. Discriminated on `alreadyConnected` so apps/web can
 * tell "redirect the browser to Zernio's OAuth page" apart from "this organization's Zernio
 * profile already has an Instagram account connected; we reconciled it locally and there is
 * nothing to authorize". */
export type ConnectResult =
  | { alreadyConnected: false; authUrl: string }
  | { alreadyConnected: true; account: InstagramAccountSummary };

/** The safe, outward-facing view of a Meta connection.
 *
 * Note what is absent: the access token, in any form. It never leaves apps/api, encrypted or
 * otherwise - see docs/SECURITY.md. */
export interface MetaConnectionSummary {
  instagramAccountId: string;
  igUserId: string;
  status: 'CONNECTED' | 'RECONNECT_REQUIRED';
  expiresAt: string;
  lastUsedAt: string | null;
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INSTAGRAM_PROVIDER) private readonly provider: InstagramProvider,
    private readonly metaConnections: MetaConnectionService,
  ) {}

  private async requireMembership(userId: string, organizationId: string): Promise<void> {
    // Same tenant-isolation pattern as organizations.service.ts's listMembers: 404 (not 403)
    // for an org the caller isn't a member of, so a non-member can't distinguish "doesn't
    // exist" from "exists but you're not in it".
    const membership = await this.prisma.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Organization not found.');
    }
  }

  async listAccounts(userId: string, organizationId: string): Promise<InstagramAccountSummary[]> {
    await this.requireMembership(userId, organizationId);

    const accounts = await this.prisma.client.instagramAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(toSummary);
  }

  // Same 404-not-403 pattern as requireMembership: an account belonging to a different
  // organization looks identical to one that doesn't exist at all.
  private async requireOwnAccount(organizationId: string, accountId: string) {
    const account = await this.prisma.client.instagramAccount.findUnique({
      where: { id: accountId },
    });
    if (!account || account.organizationId !== organizationId) {
      throw new NotFoundException('Instagram account not found.');
    }
    return account;
  }

  async listPosts(
    userId: string,
    organizationId: string,
    accountId: string,
    query: unknown,
  ): Promise<ListPostsResult> {
    await this.requireMembership(userId, organizationId);
    const account = await this.requireOwnAccount(organizationId, accountId);

    let page: number;
    let limit: number;
    try {
      ({ page, limit } = listInstagramPostsQuerySchema.parse(query));
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues[0]?.message ?? 'Invalid query.');
      }
      throw error;
    }

    // Meta first (ADR 0009): it returns the account's media immediately and in full, where
    // Zernio's poll-driven sync lags a newly published reel by hours and retains only ~12
    // months. Measured on one real account at one moment: Meta 62 posts, Zernio 47.
    const fromMeta = await this.listPostsFromMeta(account.id, account.zernioAccountId, page, limit);
    if (fromMeta) {
      return fromMeta;
    }

    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    if (!organization.zernioProfileId) {
      // Can't happen in practice - an InstagramAccount row only exists once the connect
      // flow has already set the organization's zernioProfileId - but keep the type honest.
      throw new NotFoundException('Instagram account not found.');
    }

    return this.provider.listPosts({
      zernioProfileId: organization.zernioProfileId,
      zernioAccountId: account.zernioAccountId,
      page,
      limit,
    });
  }

  /** Lists from Meta, or returns null to mean "fall back to Zernio".
   *
   * Null covers both "this account has no Meta connection" (the ordinary case for an account
   * that never connected one) and "the Meta call failed". Listing is a read path: a Meta outage
   * must degrade to Zernio's slightly staler list, never fail the page. Only a token-level
   * rejection marks the connection for reconnect - a transient failure has to be able to
   * recover on its own. */
  private async listPostsFromMeta(
    instagramAccountId: string,
    zernioAccountId: string,
    page: number,
    limit: number,
  ): Promise<ListPostsResult | null> {
    let client: MetaInstagramClient | null;
    try {
      client = await this.metaConnections.getClient(instagramAccountId);
    } catch (error) {
      this.logger.warn(
        `Could not resolve a Meta client for account ${instagramAccountId}; falling back to Zernio.`,
        error instanceof Error ? error.message : undefined,
      );
      return null;
    }
    if (!client) {
      return null;
    }

    try {
      const { posts, truncated } = await client.listMedia();
      if (truncated) {
        // Never let a bounded walk read as "this is everything".
        this.logger.warn(
          `Meta media list for account ${instagramAccountId} hit the page cap; ` +
            'older posts beyond 500 items are not shown.',
        );
      }

      // Meta paginates by cursor while this API (and the web UI built on it) is page/limit.
      // The full list is walked in the client and sliced here rather than leaking a second
      // pagination model into the UI - see packages/meta.
      const total = posts.length;
      const start = (page - 1) * limit;
      const slice = posts.slice(start, start + limit);

      await this.metaConnections.recordSuccess(instagramAccountId);

      return {
        posts: slice.map((post) => metaPostToInstagramPost(post, zernioAccountId)),
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      };
    } catch (error) {
      if (error instanceof MetaApiError && error.isAuthError) {
        await this.metaConnections.markReconnectRequired(
          instagramAccountId,
          'Meta rejected the token while listing media',
        );
      } else {
        this.logger.warn(
          `Meta listMedia failed for account ${instagramAccountId}; falling back to Zernio.`,
          error instanceof Error ? error.message : undefined,
        );
      }
      return null;
    }
  }

  /** Fetches one post by **Instagram's media id** (the pivot since Phase 17), not Zernio's `_id`. */
  async getPost(
    userId: string,
    organizationId: string,
    accountId: string,
    platformPostId: string,
  ): Promise<InstagramPost> {
    await this.requireMembership(userId, organizationId);
    const account = await this.requireOwnAccount(organizationId, accountId);

    // Meta first, same reasoning as listPosts. Note this is a genuine single-object read -
    // Zernio's GET /v1/posts/{postId} 404s for synced posts, which is why its own getPost has
    // to scan a 500-item list instead (docs/ZERNIO-INTEGRATION.md).
    const fromMeta = await this.getPostFromMeta(
      account.id,
      account.zernioAccountId,
      platformPostId,
    );
    if (fromMeta) {
      return fromMeta;
    }

    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    if (!organization.zernioProfileId) {
      // Can't happen in practice, same invariant as listPosts above.
      throw new NotFoundException('Post not found.');
    }

    const post = await this.provider.getPost({
      zernioProfileId: organization.zernioProfileId,
      zernioAccountId: account.zernioAccountId,
      platformPostId,
    });
    // Defense in depth on top of listPosts's own accountId scoping (see getPost's doc comment
    // in packages/zernio) - same "never trust an unscoped id" discipline as the callback
    // handler's live re-confirmation in Phase 8.
    if (!post || post.zernioAccountId !== account.zernioAccountId) {
      throw new NotFoundException('Post not found.');
    }
    return post;
  }

  /** Reads one post from Meta, or null to fall back to Zernio. Same degradation rules as
   * listPostsFromMeta - a missing connection and a failed call are both "try Zernio", and only
   * a rejected token marks the connection for reconnect.
   *
   * A post Meta genuinely does not have (deleted, or belonging to another account) also returns
   * null here rather than throwing, so the Zernio path still gets its turn before the caller
   * concludes the post does not exist. */
  private async getPostFromMeta(
    instagramAccountId: string,
    zernioAccountId: string,
    platformPostId: string,
  ): Promise<InstagramPost | null> {
    let client: MetaInstagramClient | null;
    try {
      client = await this.metaConnections.getClient(instagramAccountId);
    } catch {
      return null;
    }
    if (!client) {
      return null;
    }

    try {
      const post = await client.getMedia(platformPostId);
      if (!post) {
        return null;
      }
      await this.metaConnections.recordSuccess(instagramAccountId);
      return metaPostToInstagramPost(post, zernioAccountId);
    } catch (error) {
      if (error instanceof MetaApiError && error.isAuthError) {
        await this.metaConnections.markReconnectRequired(
          instagramAccountId,
          'Meta rejected the token while reading media',
        );
      } else {
        this.logger.warn(
          `Meta getMedia failed for account ${instagramAccountId}; falling back to Zernio.`,
          error instanceof Error ? error.message : undefined,
        );
      }
      return null;
    }
  }

  async createConnectUrl(userId: string, organizationId: string): Promise<ConnectResult> {
    await this.requireMembership(userId, organizationId);

    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    // Resolve the Zernio profile for this organization's slug. ensureProfile itself looks the
    // profile up by name before creating one (see packages/zernio), so a lost/never-persisted
    // zernioProfileId re-adopts the existing Zernio profile instead of creating a duplicate.
    let zernioProfileId = organization.zernioProfileId;
    if (!zernioProfileId) {
      const profile = await this.provider.ensureProfile({ name: organization.slug });
      zernioProfileId = profile.zernioProfileId;
      await this.prisma.client.organization.update({
        where: { id: organizationId },
        data: { zernioProfileId },
      });
    }

    // Ask Zernio whether this profile already has a connected Instagram account before
    // sending the user through OAuth again. If it does, reconcile our own database to match
    // and report the account back instead of an authUrl - a reconnect is only worth the
    // round trip when there's nothing connected, or the user explicitly wants to switch
    // accounts (which is what handleCallback still supports).
    const connected = await this.provider.findConnectedAccount({ zernioProfileId });
    if (connected) {
      const account = await this.adoptConnectedAccount(organizationId, connected);
      if (account) {
        return { alreadyConnected: true, account };
      }
    }

    const redirectUrl = `${getAppUrl()}/instagram/callback?organizationId=${organizationId}`;
    const { authUrl } = await this.provider.getConnectUrl({ zernioProfileId, redirectUrl });
    return { alreadyConnected: false, authUrl };
  }

  /** Writes an account Zernio reports as connected into our own database, updating the
   * existing row rather than inserting a second one for the same zernioAccountId. Returns
   * null (rather than throwing) when the account belongs to a *different* organization - the
   * caller falls back to the normal OAuth flow, where handleCallback raises the proper 409,
   * so a cross-tenant collision can never be silently adopted here. */
  private async adoptConnectedAccount(
    organizationId: string,
    connected: { zernioAccountId: string; username: string | null },
  ): Promise<InstagramAccountSummary | null> {
    const existing = await this.prisma.client.instagramAccount.findUnique({
      where: { zernioAccountId: connected.zernioAccountId },
    });
    if (existing && existing.organizationId !== organizationId) {
      return null;
    }

    try {
      const account = await this.prisma.client.instagramAccount.upsert({
        where: { zernioAccountId: connected.zernioAccountId },
        create: {
          organizationId,
          zernioAccountId: connected.zernioAccountId,
          username: connected.username,
          status: 'CONNECTED',
        },
        update: { username: connected.username, status: 'CONNECTED' },
      });
      return toSummary(account);
    } catch (error) {
      // Same race as handleCallback's: a concurrent connect for the same zernioAccountId can
      // win between the check above and this upsert. Fall back to the OAuth flow rather than
      // failing the request outright.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  /** Confirms with Zernio that `accountId` really is connected to `profileId`, retrying briefly
   * before giving up (Phase 16.1, requirement 6).
   *
   * The bug this fixes: a user completes Instagram's consent screen, Zernio redirects them back,
   * and this app tells them the connection failed - while the account is, in fact, connected. Go
   * back to the dashboard manually and there it is.
   *
   * The cause is that `GET /v1/accounts` is eventually consistent with the connection Zernio has
   * only just finished making. The callback arrives at the speed of an HTTP redirect, which is
   * frequently faster than Zernio's own read path settles, so the single confirmation call came
   * back empty and a successful connection was reported as an error.
   *
   * The confirmation itself is NOT skipped - dropping it would mean trusting `accountId` from a
   * query string the user's own browser supplied, which is exactly what this check exists to
   * prevent. It is only retried. Delays are short and bounded (0.5s + 1s + 2s = 3.5s worst case)
   * because this runs inside a request the user is actively waiting on.
   */
  private async confirmWithRetry(
    profileId: string,
    accountId: string,
  ): Promise<{ zernioAccountId: string; username: string | null } | null> {
    const delaysMs = [500, 1000, 2000];

    for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
      const confirmed = await this.provider.findConnectedAccount({ zernioProfileId: profileId });
      if (confirmed && confirmed.zernioAccountId === accountId) {
        return confirmed;
      }

      const delay = delaysMs[attempt];
      if (delay === undefined) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return null;
  }

  async handleCallback(
    userId: string,
    organizationId: string,
    input: unknown,
  ): Promise<InstagramAccountSummary> {
    await this.requireMembership(userId, organizationId);

    let profileId: string;
    let accountId: string;
    try {
      ({ profileId, accountId } = instagramCallbackSchema.parse(input));
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues[0]?.message ?? 'Invalid input.');
      }
      throw error;
    }

    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    if (organization.zernioProfileId !== profileId) {
      throw new BadRequestException('This connection does not belong to this organization.');
    }

    // Never trust the redirect query params alone (they arrived via the user's own browser) -
    // independently confirm the connection with a live Zernio call before writing anything.
    const confirmed = await this.confirmWithRetry(profileId, accountId);
    if (!confirmed) {
      throw new BadRequestException('Could not confirm this Instagram connection with Zernio.');
    }

    const existing = await this.prisma.client.instagramAccount.findUnique({
      where: { zernioAccountId: accountId },
    });
    if (existing && existing.organizationId !== organizationId) {
      throw new ConflictException(
        'This Instagram account is already connected to a different organization.',
      );
    }

    try {
      const account = await this.prisma.client.instagramAccount.upsert({
        where: { zernioAccountId: accountId },
        create: {
          organizationId,
          zernioAccountId: accountId,
          username: confirmed.username,
          status: 'CONNECTED',
        },
        update: { username: confirmed.username, status: 'CONNECTED' },
      });
      return toSummary(account);
    } catch (error) {
      // Covers the race between the findUnique check above and this upsert - two concurrent
      // callbacks for the same zernioAccountId can both pass the check but only one create
      // wins; the loser hits this unique-constraint violation instead of silently
      // overwriting the winner's organizationId.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'This Instagram account is already connected to a different organization.',
        );
      }
      throw error;
    }
  }

  // --- Direct Meta connection (Phase 17) -------------------------------------------------
  // Separate from the Zernio connect flow above. An account needs both: Zernio to run the
  // automations, Meta so a just-published reel is listable now rather than in a few hours.

  async createMetaConnectUrl(
    userId: string,
    organizationId: string,
    accountId: string,
  ): Promise<{ authUrl: string }> {
    await this.requireMembership(userId, organizationId);
    const account = await this.requireOwnAccount(organizationId, accountId);

    return {
      authUrl: this.metaConnections.createAuthorizeUrl(userId, organizationId, account.id),
    };
  }

  async handleMetaCallback(
    userId: string,
    organizationId: string,
    body: unknown,
  ): Promise<MetaConnectionSummary> {
    await this.requireMembership(userId, organizationId);

    const parsed = metaCallbackSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid callback payload.');
    }

    // The connection is bound using the organization and account named by the *signed* state,
    // not the route's organizationId. Those must agree: a callback whose state names a
    // different organization must not bind a connection just because the caller happens to be
    // a member of this one.
    const result = await this.metaConnections.handleCallback(parsed.data.code, parsed.data.state);
    if (result.organizationId !== organizationId) {
      throw new NotFoundException('Instagram account not found.');
    }

    const connection = await this.prisma.client.metaConnection.findUnique({
      where: { instagramAccountId: result.instagramAccountId },
    });
    if (!connection) {
      throw new NotFoundException('Meta connection not found after callback.');
    }
    return toMetaSummary(connection);
  }

  async getMetaConnection(
    userId: string,
    organizationId: string,
    accountId: string,
  ): Promise<MetaConnectionSummary | null> {
    await this.requireMembership(userId, organizationId);
    const account = await this.requireOwnAccount(organizationId, accountId);

    const connection = await this.prisma.client.metaConnection.findUnique({
      where: { instagramAccountId: account.id },
    });
    return connection ? toMetaSummary(connection) : null;
  }

  async disconnectMeta(userId: string, organizationId: string, accountId: string): Promise<void> {
    await this.requireMembership(userId, organizationId);
    const account = await this.requireOwnAccount(organizationId, accountId);

    // Deleting the connection is not destructive to anything the user can see: listing simply
    // falls back to Zernio, and automations are unaffected because they live in Zernio anyway.
    await this.metaConnections.disconnect(organizationId, account.id);
  }
}

const metaCallbackSchema = z.object({
  code: z.string().min(1, 'Missing authorization code.'),
  state: z.string().min(1, 'Missing OAuth state.'),
});

function toMetaSummary(connection: {
  instagramAccountId: string;
  igUserId: string;
  status: string;
  expiresAt: Date;
  lastUsedAt: Date | null;
}): MetaConnectionSummary {
  return {
    instagramAccountId: connection.instagramAccountId,
    igUserId: connection.igUserId,
    status: connection.status === 'RECONNECT_REQUIRED' ? 'RECONNECT_REQUIRED' : 'CONNECTED',
    expiresAt: connection.expiresAt.toISOString(),
    lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
  };
}

function toSummary(account: {
  id: string;
  zernioAccountId: string;
  username: string | null;
  status: InstagramAccountStatus;
}): InstagramAccountSummary {
  return {
    id: account.id,
    zernioAccountId: account.zernioAccountId,
    username: account.username,
    status: account.status,
  };
}
