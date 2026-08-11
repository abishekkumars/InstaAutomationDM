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
} from './instagram-provider';

// Base URL + auth scheme, and every endpoint shape below, verified directly against Zernio's
// live OpenAPI spec (docs.zernio.com/api/openapi) during Phase 8 - see
// docs/ZERNIO-INTEGRATION.md's "Account connection" section, not invented here per CLAUDE.md.
export const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

interface ZernioErrorBody {
  error?: string;
  message?: string;
  code?: string;
  details?: { existingProfileId?: string };
}

export class ZernioApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: ZernioErrorBody | undefined,
  ) {
    super(
      `Zernio API error: ${method} ${path} -> ${status} ${body?.message ?? body?.error ?? ''}`.trim(),
    );
  }
}

export class ZernioInstagramProvider implements InstagramProvider {
  constructor(private readonly apiKey: string) {}

  async ensureProfile(input: EnsureProfileInput): Promise<EnsureProfileResult> {
    try {
      const response = await this.request<{ profile: { _id: string } }>('POST', '/profiles', {
        name: input.name,
      });
      return { zernioProfileId: response.profile._id };
    } catch (error) {
      // A duplicate profile name (409) is expected on a retried create after a prior attempt
      // created the Zernio profile but failed before we could persist its id locally -
      // recover the existing profile id instead of leaving the organization stuck.
      if (
        error instanceof ZernioApiError &&
        error.status === 409 &&
        error.body?.details?.existingProfileId
      ) {
        return { zernioProfileId: error.body.details.existingProfileId };
      }
      throw error;
    }
  }

  async getConnectUrl(input: GetConnectUrlInput): Promise<GetConnectUrlResult> {
    const query = new URLSearchParams({
      profileId: input.zernioProfileId,
      redirect_url: input.redirectUrl,
    });
    const response = await this.request<{ authUrl: string }>(
      'GET',
      `/connect/instagram?${query.toString()}`,
    );
    return { authUrl: response.authUrl };
  }

  async findConnectedAccount(
    input: FindConnectedAccountInput,
  ): Promise<ConnectedInstagramAccount | null> {
    const query = new URLSearchParams({ profileId: input.zernioProfileId, platform: 'instagram' });
    const response = await this.request<{
      accounts: Array<{ _id: string; username?: string | null }>;
    }>('GET', `/accounts?${query.toString()}`);

    const account = response.accounts[0];
    if (!account) {
      return null;
    }
    return { zernioAccountId: account._id, username: account.username ?? null };
  }

  async listPosts(input: ListPostsInput): Promise<ListPostsResult> {
    const query = new URLSearchParams({
      profileId: input.zernioProfileId,
      accountId: input.zernioAccountId,
      platform: 'instagram',
      // "external" = posts synced from Instagram itself (existing content), as opposed to
      // "zernio" = posts authored through Zernio's own publishing tool, which this project
      // has no feature for - see docs/ZERNIO-INTEGRATION.md's "Listing posts/reels" section.
      source: 'external',
      page: String(input.page),
      limit: String(input.limit),
    });
    const response = await this.request<RawPostsListResponse>('GET', `/posts?${query.toString()}`);
    return {
      posts: response.posts.map(toInstagramPost),
      pagination: response.pagination,
    };
  }

  async getPost(input: GetPostInput): Promise<InstagramPost | null> {
    // GET /v1/posts/{postId} does not work for source: external (synced) posts - verified
    // live during Phase 9 (404s even for an id taken directly from a real listPosts
    // response, with or without profileId/source query params). Search a max-size listPosts
    // call instead; 500 (Zernio's own max limit) comfortably covers the ~12-month synced
    // history this project's account sizes actually produce.
    const { posts } = await this.listPosts({
      zernioProfileId: input.zernioProfileId,
      zernioAccountId: input.zernioAccountId,
      page: 1,
      limit: 500,
    });
    return posts.find((post) => post.zernioPostId === input.zernioPostId) ?? null;
  }

  async createCommentAutomation(input: CreateCommentAutomationInput): Promise<CommentAutomation> {
    const response = await this.request<{ automation: RawCommentAutomation }>(
      'POST',
      '/comment-automations',
      {
        profileId: input.zernioProfileId,
        accountId: input.zernioAccountId,
        platformPostId: input.zernioPostId,
        name: input.name,
        keywords: input.keywords,
        matchMode: input.matchMode,
        commentReply: input.commentReply,
        dmMessage: input.dmMessage,
      },
    );
    return toCommentAutomation(response.automation);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) {
      // Lazy check (not thrown at DI-construction time) so apps/api's health/readiness
      // endpoints stay up even if ZERNIO_API_KEY is unset - same pattern as
      // apps/api/src/auth/session.guard.ts's API_INTERNAL_SECRET check.
      throw new Error('ZERNIO_API_KEY is not configured.');
    }

    const response = await fetch(`${ZERNIO_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as
        ZernioErrorBody | undefined;
      throw new ZernioApiError(method, path, response.status, errorBody);
    }

    return (await response.json()) as T;
  }
}

// Raw shape of GET /v1/posts (Zernio's OpenAPI `Post`/`PlatformTarget`/`MediaItem` schemas),
// verified against the live spec during Phase 9 - see docs/ZERNIO-INTEGRATION.md's "Listing
// posts/reels" section. Only the fields this provider actually maps are declared; everything
// else Zernio returns is ignored.
interface RawMediaItem {
  type?: 'image' | 'video' | 'gif' | 'document';
  url?: string;
  thumbnail?: string;
  instagramThumbnail?: string;
}

interface RawPlatformTarget {
  platform?: string;
  // Per the OpenAPI spec, `oneOf: [string, SocialAccount]` - either the bare account id, or
  // an expanded account object with its own `_id`.
  accountId?: string | { _id?: string };
  platformPostId?: string;
  platformPostUrl?: string;
  publishedAt?: string;
}

interface RawPost {
  _id: string;
  content?: string;
  mediaItems?: RawMediaItem[];
  platforms?: RawPlatformTarget[];
  publishedAt?: string;
}

interface RawPostsListResponse {
  posts: RawPost[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

// Raw shape of the comment-automations endpoints (create/list), verified against the live
// spec during Phase 10 - see docs/ZERNIO-INTEGRATION.md's "Comment-to-DM automation API"
// section. The create response omits `accountId` (list/get include it); callers that need it
// already have it from their own input, so this is not treated as missing data.
interface RawCommentAutomation {
  id: string;
  accountId?: string;
  platformPostId?: string;
  name: string;
  keywords?: string[];
  matchMode?: 'contains' | 'word' | 'exact';
  commentReply?: string;
  dmMessage: string;
  isActive?: boolean;
}

function toCommentAutomation(automation: RawCommentAutomation): CommentAutomation {
  return {
    zernioAutomationId: automation.id,
    zernioAccountId: automation.accountId ?? null,
    zernioPostId: automation.platformPostId ?? null,
    name: automation.name,
    keywords: automation.keywords ?? [],
    matchMode: automation.matchMode ?? 'contains',
    commentReply: automation.commentReply ?? null,
    dmMessage: automation.dmMessage,
    isActive: automation.isActive ?? true,
  };
}

function toInstagramPost(post: RawPost): InstagramPost {
  const platformTarget =
    post.platforms?.find((p) => p.platform === 'instagram') ?? post.platforms?.[0];
  const media = post.mediaItems?.[0];
  const accountId = platformTarget?.accountId;
  return {
    zernioPostId: post._id,
    zernioAccountId: (typeof accountId === 'string' ? accountId : accountId?._id) ?? null,
    platformPostId: platformTarget?.platformPostId ?? null,
    permalink: platformTarget?.platformPostUrl ?? null,
    caption: post.content ?? '',
    mediaType: media?.type ?? null,
    thumbnailUrl: media?.instagramThumbnail ?? media?.thumbnail ?? media?.url ?? null,
    publishedAt: platformTarget?.publishedAt ?? post.publishedAt ?? null,
  };
}
