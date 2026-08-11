import type {
  CommentAutomation,
  ConnectedInstagramAccount,
  CreateCommentAutomationInput,
  DmButton,
  EnsureProfileInput,
  EnsureProfileResult,
  FindConnectedAccountInput,
  GetConnectUrlInput,
  GetConnectUrlResult,
  GetPostInput,
  InstagramPost,
  InstagramProvider,
  ListCommentAutomationsInput,
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
    // Look first, create second. Zernio's GET /v1/profiles takes an exact-match `name` filter
    // that its own spec documents for precisely this case ("useful to recover a profile id
    // after an ambiguous create"). Without this lookup, an organization whose zernioProfileId
    // was never persisted locally - a crash, or a failed DB write, between the Zernio create
    // and our own update - would POST a fresh profile on every retry, and Zernio's 409 body is
    // the only thing standing between that and a pile of duplicate profiles.
    const existing = await this.findProfileByName(input.name);
    if (existing) {
      return { zernioProfileId: existing, reused: true };
    }

    try {
      const response = await this.request<{ profile: { _id: string } }>('POST', '/profiles', {
        name: input.name,
      });
      return { zernioProfileId: response.profile._id, reused: false };
    } catch (error) {
      // Backstop for the race between the lookup above and this create (two concurrent
      // connect attempts for the same organization): Zernio returns a 409 whose
      // details.existingProfileId carries the winner's id. Recover it rather than leaving
      // the organization stuck - but re-query by name if that field is absent, since the
      // spec only guarantees it for the name-conflict case, not for the "same
      // Idempotency-Key still processing" 409 that shares this status code.
      if (error instanceof ZernioApiError && error.status === 409) {
        if (error.body?.details?.existingProfileId) {
          return { zernioProfileId: error.body.details.existingProfileId, reused: true };
        }
        const raced = await this.findProfileByName(input.name);
        if (raced) {
          return { zernioProfileId: raced, reused: true };
        }
      }
      throw error;
    }
  }

  /** Exact-match profile lookup by name. Returns the profile's `_id`, or null if Zernio has
   * no profile with that name. `name` is an exact-match filter per Zernio's own spec, but the
   * result is still re-checked here rather than trusting the server to have filtered - the
   * same "never trust an unscoped response" discipline used elsewhere in this provider. */
  private async findProfileByName(name: string): Promise<string | null> {
    const query = new URLSearchParams({ name });
    const response = await this.request<{
      profiles?: Array<{ _id: string; name?: string }>;
    }>('GET', `/profiles?${query.toString()}`);

    const match = (response.profiles ?? []).find((profile) => profile.name === name);
    return match?._id ?? null;
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
        // Two DIFFERENT ids, per Zernio's own spec: `platformPostId` is "Platform media/post
        // ID" (Instagram's own media id - what an incoming comment reports), while `postId` is
        // "Zernio post ID ... required only when also targeting a specific post via
        // platformPostId", which this project always does. Sending Zernio's `_id` as
        // `platformPostId` (as this did before) scopes the automation to an id Instagram never
        // reports, so it can never fire.
        platformPostId: input.platformPostId,
        postId: input.zernioPostId,
        name: input.name,
        keywords: input.keywords,
        matchMode: input.matchMode,
        commentReply: input.commentReply,
        // Omit entirely (not []) when there are none - undefined keys are dropped by
        // JSON.stringify, same as commentReply above; Zernio's own docs say either is
        // equivalent for "no buttons," but omitting keeps the request body minimal.
        buttons: input.buttons?.length ? input.buttons.map(toRawDmButton) : undefined,
        dmMessage: input.dmMessage,
      },
    );
    return toCommentAutomation(response.automation);
  }

  async listCommentAutomations(input: ListCommentAutomationsInput): Promise<CommentAutomation[]> {
    const query = new URLSearchParams({ profileId: input.zernioProfileId });
    const response = await this.request<{ automations: RawCommentAutomation[] }>(
      'GET',
      `/comment-automations?${query.toString()}`,
    );
    return response.automations.map(toCommentAutomation);
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

// Raw shape of a DM button on the comment-automations endpoints (Zernio's `DmButton` schema,
// verified against the live spec during Phase 10.1) - `type: postback | phone` are real but
// out of this project's scope (see docs/ZERNIO-INTEGRATION.md), so only `url` is ever sent or
// read back.
interface RawDmButton {
  type?: 'url' | 'postback' | 'phone';
  title?: string;
  url?: string;
  payload?: string;
  phone?: string;
}

function toRawDmButton(button: DmButton): RawDmButton {
  return { type: 'url', title: button.title, url: button.url };
}

function fromRawDmButtons(buttons: RawDmButton[] | undefined): DmButton[] {
  return (buttons ?? [])
    .filter(
      (button): button is RawDmButton & { title: string; url: string } =>
        button.type === 'url' && Boolean(button.title) && Boolean(button.url),
    )
    .map((button) => ({ title: button.title, url: button.url }));
}

// Raw shape of the comment-automations endpoints (create/list), verified against the live
// spec during Phase 10 (and re-verified for `buttons` during Phase 10.1) - see
// docs/ZERNIO-INTEGRATION.md's "Comment-to-DM automation API" section. The create response
// omits `accountId` (list/get include it); callers that need it already have it from their
// own input, so this is not treated as missing data.
interface RawCommentAutomation {
  id: string;
  accountId?: string;
  /** Instagram's own media id. */
  platformPostId?: string;
  /** Zernio's own post id. Only present on automations created with the `postId` field set. */
  postId?: string;
  name: string;
  keywords?: string[];
  matchMode?: 'contains' | 'word' | 'exact';
  commentReply?: string;
  buttons?: RawDmButton[];
  dmMessage: string;
  isActive?: boolean;
}

function toCommentAutomation(automation: RawCommentAutomation): CommentAutomation {
  return {
    zernioAutomationId: automation.id,
    zernioAccountId: automation.accountId ?? null,
    zernioPostId: automation.postId ?? null,
    platformPostId: automation.platformPostId ?? null,
    name: automation.name,
    keywords: automation.keywords ?? [],
    matchMode: automation.matchMode ?? 'contains',
    commentReply: automation.commentReply ?? null,
    buttons: fromRawDmButtons(automation.buttons),
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
