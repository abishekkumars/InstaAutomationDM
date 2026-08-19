import type {
  AutomationAudience,
  CommentAutomation,
  ConnectedInstagramAccount,
  CreateCommentAutomationInput,
  DeleteCommentAutomationInput,
  DeleteProfileInput,
  DisconnectAccountInput,
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
  UpdateCommentAutomationInput,
} from './instagram-provider';

// Base URL + auth scheme, and every endpoint shape below, verified directly against Zernio's
// live OpenAPI spec (docs.zernio.com/api/openapi) during Phase 8 - see
// docs/ZERNIO-INTEGRATION.md's "Account connection" section, not invented here per CLAUDE.md.
export const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

/** Per-request deadline. Chosen against measured Zernio latency: a normal response is 0.3-1.7s,
 * and the slowest observed (a 500-post, 169 KB list) was 1.73s, so 10s is comfortably above the
 * real p100 while still failing fast enough to keep a page render alive. */
const REQUEST_TIMEOUT_MS = 10_000;

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
    // Matched on the Instagram media id since Phase 17, not Zernio's `_id`: that is the pivot
    // the rest of the stack now keys on, and the only id a Meta-sourced post shares with this
    // Zernio-sourced list.
    return posts.find((post) => post.platformPostId === input.platformPostId) ?? null;
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
        // Zernio's own `_id`. Sending Zernio's `_id` as `platformPostId` (as this did before
        // Phase 10.2b) scopes the automation to an id Instagram never reports, so it can never
        // fire.
        platformPostId: input.platformPostId,
        // Omitted entirely when absent, rather than sent as null/undefined. Verified 2026-08-19:
        // Zernio accepts a create with `platformPostId` alone and the automation fires - which
        // is the only reason a post Zernio has not synced yet can be automated at all.
        ...(input.zernioPostId ? { postId: input.zernioPostId } : {}),
        name: input.name,
        // Sent as-is, including `[]`. Zernio's spec is explicit that an empty keyword list means
        // "any comment triggers" (verified against the live OpenAPI spec, Phase 16.2), which is
        // exactly what the wizard's "Any comments" tab asks for.
        keywords: input.keywords,
        matchMode: input.matchMode,
        audience: toRawAudience(input.audience),
        commentReply: input.commentReply,
        // Omitted (not []) when empty, same convention as `buttons` below.
        commentReplyVariations: input.commentReplyVariations?.length
          ? input.commentReplyVariations
          : undefined,
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

  async updateCommentAutomation(input: UpdateCommentAutomationInput): Promise<CommentAutomation> {
    const response = await this.request<{ automation: RawCommentAutomation }>(
      'PATCH',
      `/comment-automations/${encodeURIComponent(input.zernioAutomationId)}`,
      {
        // Every key is conditionally included: JSON.stringify drops undefined, and Zernio's
        // PATCH treats an absent key as "leave this alone". `buttons: []` is meaningful (it
        // clears them), so it must survive - hence the explicit undefined check rather than
        // the `?.length ? ... : undefined` shape createCommentAutomation uses.
        name: input.name,
        keywords: input.keywords,
        matchMode: input.matchMode,
        audience: toRawAudience(input.audience),
        commentReply: input.commentReply,
        // Same explicit-undefined check as `buttons`: `[]` must survive, because that is how a
        // set of reply variations gets cleared.
        commentReplyVariations: input.commentReplyVariations,
        buttons: input.buttons === undefined ? undefined : input.buttons.map(toRawDmButton),
        dmMessage: input.dmMessage,
        isActive: input.isActive,
      },
    );
    return toCommentAutomation(response.automation);
  }

  async deleteCommentAutomation(input: DeleteCommentAutomationInput): Promise<void> {
    await this.request<unknown>(
      'DELETE',
      `/comment-automations/${encodeURIComponent(input.zernioAutomationId)}`,
    );
  }

  async disconnectAccount(input: DisconnectAccountInput): Promise<void> {
    // "Disconnect account" - verified against the live spec on 2026-08-20. Answers 200 with a
    // `{ message }` body, not 204, so the response is read and discarded.
    await this.request<unknown>('DELETE', `/accounts/${encodeURIComponent(input.zernioAccountId)}`);
  }

  async deleteProfile(input: DeleteProfileInput): Promise<void> {
    // Zernio 400s here while the profile still has ACTIVE connected accounts ("disconnect them
    // first"). The caller disconnects every account before reaching this; the 400 is left to
    // propagate rather than being swallowed, because silently reporting a successful delete for
    // a profile that still exists would strand it.
    await this.request<unknown>('DELETE', `/profiles/${encodeURIComponent(input.zernioProfileId)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) {
      // Lazy check (not thrown at DI-construction time) so apps/api's health/readiness
      // endpoints stay up even if ZERNIO_API_KEY is unset - same pattern as
      // apps/api/src/auth/session.guard.ts's API_INTERNAL_SECRET check.
      throw new Error('ZERNIO_API_KEY is not configured.');
    }

    // Bounded, because these calls are on the critical path of a user-facing page render and
    // Zernio's own latency is the dominant cost there (measured 0.4-1.7s for a normal response).
    // Without a deadline a single hung upstream request would hold a serverless invocation open
    // until the platform's own much longer timeout, turning one slow call into a dead page.
    let response: Response;
    try {
      response = await fetch(`${ZERNIO_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A timeout surfaces as a DOMException named TimeoutError. Re-thrown as a ZernioApiError with
      // a 504 so callers that already branch on `status` (the 404/409 recovery paths) keep working
      // and do not have to learn a second error shape.
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ZernioApiError(method, path, 504, {
          error: `Zernio did not respond within ${REQUEST_TIMEOUT_MS}ms.`,
        });
      }
      throw error;
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as
        ZernioErrorBody | undefined;
      throw new ZernioApiError(method, path, response.status, errorBody);
    }

    // DELETE responds 200 with no JSON body; parsing it unconditionally would throw on the
    // empty payload and turn a successful delete into an error. Callers that expect nothing
    // back (deleteCommentAutomation) request `unknown` and ignore the result.
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (text.length === 0) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
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

/** Wraps a follower-status filter in the nested object Zernio's API expects, or omits it.
 *
 * `'any'` sends nothing at all rather than `{followerStatus: 'any'}`. That is Zernio's own
 * default, so the two are equivalent - but omitting it keeps the request body minimal and, more
 * usefully, means a PATCH that is not changing the audience does not silently re-assert it.
 *
 * `whenUnknown` is deliberately left at Zernio's default (`send`). Instagram only discloses the
 * follow relationship for people who have messaged the account before, so a stricter setting
 * would silently drop DMs to commenters whose status simply cannot be determined - which reads
 * as the automation being broken. See docs/ZERNIO-INTEGRATION.md. */
function toRawAudience(
  audience: AutomationAudience | undefined,
): { followerStatus: AutomationAudience } | undefined {
  return audience && audience !== 'any' ? { followerStatus: audience } : undefined;
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
  audience?: { followerStatus?: AutomationAudience };
  commentReply?: string;
  commentReplyVariations?: string[];
  buttons?: RawDmButton[];
  dmMessage: string;
  isActive?: boolean;
  /** Only present on the LIST endpoint's response - create/get return a different, smaller
   * `{totalTriggered, totalSent, totalFailed}` shape, which this project doesn't map. */
  stats?: {
    triggered?: number;
    dmsSent?: number;
    dmsFailed?: number;
    uniqueContacts?: number;
    trackedSends?: number;
    linkClicks?: number;
    uniqueClicks?: number;
  };
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
    // Zernio omits `audience` entirely on automations that never set one, which means the same
    // thing as `any`.
    audience: automation.audience?.followerStatus ?? 'any',
    commentReply: automation.commentReply ?? null,
    commentReplyVariations: automation.commentReplyVariations ?? [],
    buttons: fromRawDmButtons(automation.buttons),
    dmMessage: automation.dmMessage,
    isActive: automation.isActive ?? true,
    // Distinguish "no stats object at all" (a create/get response) from "stats present but a
    // counter is absent" (treated as 0) - the first is missing data, the second is a real zero.
    stats: automation.stats
      ? {
          triggered: automation.stats.triggered ?? 0,
          dmsSent: automation.stats.dmsSent ?? 0,
          dmsFailed: automation.stats.dmsFailed ?? 0,
          uniqueContacts: automation.stats.uniqueContacts ?? 0,
          trackedSends: automation.stats.trackedSends ?? 0,
          linkClicks: automation.stats.linkClicks ?? 0,
          uniqueClicks: automation.stats.uniqueClicks ?? 0,
        }
      : null,
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
