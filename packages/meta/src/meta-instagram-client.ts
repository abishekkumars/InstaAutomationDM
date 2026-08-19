// Read-only client for Meta's Instagram Graph API (Instagram Login flavour).
//
// Every endpoint, field name and pagination detail below was verified against a real connected
// account on 2026-08-19 - not transcribed from Meta's docs and not assumed, per CLAUDE.md's
// "never invent third-party API behavior" rule. See
// docs/ADR/0009-direct-meta-graph-api-for-post-listing.md for the measurements.
//
// This client is deliberately read-only. Publishing stays out of scope (ADR 0005), and Meta
// exposes no writable surface this project needs.

/** Instagram Login host. The Facebook Login flavour (`graph.facebook.com`, requiring a linked
 * Facebook Page and an `{ig-user-id}` lookup via `/me/accounts`) is not used - this project
 * connects Instagram professional accounts directly, matching Zernio's own `instagram_login`
 * flow. */
export const META_GRAPH_BASE_URL = 'https://graph.instagram.com';

/** Pinned in one place so a version bump is a single edit. `v25.0` is what Meta's own current
 * documentation renders in its examples, and what the verification calls used. */
export const META_GRAPH_VERSION = 'v25.0';

/** Per-request deadline. Same reasoning as packages/zernio's: these calls sit on the critical
 * path of a user-facing page render, and without a deadline one hung upstream request holds a
 * serverless invocation open until the platform's much longer timeout. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Meta's own maximum useful page size for this edge. */
const PAGE_SIZE = 100;

/** Hard cap on cursor-following. CLAUDE.md forbids unbounded loops on request paths; 5 pages is
 * 500 media items, comfortably above this project's real account sizes (the verification account
 * had 62 in total) while guaranteeing the walk terminates. `listMedia` reports when it stops
 * early rather than silently truncating. */
const MAX_PAGES = 5;

/** The fields requested on every media read. `media_type` alone is not enough to identify a
 * reel - Meta returns `VIDEO` for reels - so `media_product_type` is always requested alongside
 * it. There is deliberately **no trial field**: none exists (see ADR 0009). */
const MEDIA_FIELDS = [
  'id',
  'caption',
  'media_type',
  'media_product_type',
  'permalink',
  'shortcode',
  'thumbnail_url',
  'media_url',
  'timestamp',
  'comments_count',
  'like_count',
].join(',');

/** Where Instagram published the media. `REELS` is how a reel is identified; `media_type` says
 * `VIDEO` for both reels and ordinary videos. */
export type MetaMediaProductType = 'AD' | 'FEED' | 'STORY' | 'REELS';

/** One post/reel as Meta reports it, mapped into this project's own vocabulary.
 *
 * Deliberately **not** `InstagramPost` (packages/zernio): that type requires a `zernioPostId`,
 * which a Meta-sourced post does not have and may never have. apps/api maps this into
 * `InstagramPost` at the service boundary, supplying `zernioPostId: null`. */
export interface MetaPost {
  /** Instagram's own media id. The pivot this project keys posts and automations on since
   * Phase 17 - it is what an incoming comment reports, and what Zernio's
   * `POST /v1/comment-automations` accepts as `platformPostId`. */
  platformPostId: string;
  permalink: string | null;
  shortcode: string | null;
  caption: string;
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  mediaProductType: MetaMediaProductType | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  commentsCount: number | null;
  likeCount: number | null;
}

export interface MetaProfile {
  igUserId: string;
  username: string | null;
  /** `BUSINESS` or `MEDIA_CREATOR` for a professional account. Personal accounts cannot reach
   * this API at all, so a successful call already implies one of the two. */
  accountType: string | null;
  mediaCount: number | null;
}

export interface ListMediaResult {
  posts: MetaPost[];
  /** True when MAX_PAGES was reached and Meta still offered another cursor. Surfaced rather than
   * hidden so a caller can log it - a silently truncated list reads as "this is everything". */
  truncated: boolean;
}

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export class MetaApiError extends Error {
  constructor(
    /** Path only - **never** the full URL, which carries the access token in a query param and
     * would leak it into every log line that prints this error. */
    path: string,
    public readonly status: number,
    public readonly body: MetaErrorBody | undefined,
  ) {
    super(`Meta API error: GET ${path} -> ${status} ${body?.error?.message ?? ''}`.trim());
  }

  /** True when Meta rejected the token itself rather than the request. Code 190 is
   * `OAuthException` for an invalid or expired access token; 102 is a session error. Callers use
   * this to mark the connection `RECONNECT_REQUIRED` instead of retrying forever. */
  get isAuthError(): boolean {
    const code = this.body?.error?.code;
    return this.status === 401 || code === 190 || code === 102;
  }
}

interface RawMedia {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  shortcode?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  comments_count?: number;
  like_count?: number;
}

interface RawMediaPage {
  data?: RawMedia[];
  paging?: { cursors?: { after?: string } };
}

/** Meta's `media_type` is `IMAGE | VIDEO | CAROUSEL_ALBUM`. This project's domain vocabulary
 * (shared with the Zernio path so the UI renders both identically) is
 * `image | video | gif | document`.
 *
 * `CAROUSEL_ALBUM` maps to `image`: a carousel's own thumbnail is a still, and the domain has no
 * carousel member. That is a lossy but honest mapping - the alternative would be inventing a
 * fifth member that only one of the two sources can ever produce. */
function toDomainMediaType(raw: string | undefined): MetaPost['mediaType'] {
  switch (raw) {
    case 'IMAGE':
    case 'CAROUSEL_ALBUM':
      return 'image';
    case 'VIDEO':
      return 'video';
    default:
      return null;
  }
}

function toMediaProductType(raw: string | undefined): MetaMediaProductType | null {
  switch (raw) {
    case 'AD':
    case 'FEED':
    case 'STORY':
    case 'REELS':
      return raw;
    default:
      return null;
  }
}

function toMetaPost(raw: RawMedia): MetaPost | null {
  // A media object with no id is unusable - it cannot be keyed, linked, or automated. Dropped
  // rather than surfaced as a broken row.
  if (!raw.id) {
    return null;
  }

  return {
    platformPostId: raw.id,
    permalink: raw.permalink ?? null,
    shortcode: raw.shortcode ?? null,
    caption: raw.caption ?? '',
    mediaType: toDomainMediaType(raw.media_type),
    mediaProductType: toMediaProductType(raw.media_product_type),
    // `thumbnail_url` is only present on VIDEO media; for images `media_url` is the still
    // itself, so it is the correct fallback rather than an approximation.
    thumbnailUrl: raw.thumbnail_url ?? raw.media_url ?? null,
    publishedAt: raw.timestamp ?? null,
    commentsCount: raw.comments_count ?? null,
    likeCount: raw.like_count ?? null,
  };
}

export class MetaInstagramClient {
  constructor(private readonly accessToken: string) {}

  /** Confirms who the token belongs to. Used at connect time to bind a Meta connection to an
   * Instagram account, and as the cheapest possible liveness check on a stored token. */
  async getProfile(): Promise<MetaProfile> {
    const raw = await this.request<{
      id?: string;
      username?: string;
      account_type?: string;
      media_count?: number;
    }>('/me', { fields: 'id,username,account_type,media_count' });

    if (!raw.id) {
      throw new MetaApiError('/me', 502, {
        error: { message: 'Meta returned a profile with no id.' },
      });
    }

    return {
      igUserId: raw.id,
      username: raw.username ?? null,
      accountType: raw.account_type ?? null,
      mediaCount: raw.media_count ?? null,
    };
  }

  /** Lists the account's media, newest first, following Meta's cursor pagination up to
   * MAX_PAGES.
   *
   * Meta paginates by opaque cursor (`paging.cursors.after`), not by page number - unlike
   * Zernio's page/limit scheme. The whole list is walked here and returned flat so the calling
   * service can keep exposing the page/limit API the web app already uses, rather than leaking
   * two different pagination models into the UI. */
  async listMedia(): Promise<ListMediaResult> {
    const posts: MetaPost[] = [];
    let after: string | undefined;
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params: Record<string, string> = { fields: MEDIA_FIELDS, limit: String(PAGE_SIZE) };
      if (after) {
        params.after = after;
      }

      const raw = await this.request<RawMediaPage>('/me/media', params);
      for (const item of raw.data ?? []) {
        const post = toMetaPost(item);
        if (post) {
          posts.push(post);
        }
      }

      after = raw.paging?.cursors?.after;
      // Meta returns a cursor even on the final page; the reliable end-of-list signal is an
      // empty `data` array, confirmed live on 2026-08-19 (the cursor after the last page
      // returned `{"data": []}`). Stopping on a short page too, since a page smaller than the
      // requested limit cannot be followed by more.
      if (!after || (raw.data?.length ?? 0) < PAGE_SIZE) {
        return { posts, truncated: false };
      }

      truncated = page === MAX_PAGES - 1;
    }

    return { posts, truncated };
  }

  /** Reads a single media object by its Instagram media id.
   *
   * Worth contrasting with the Zernio path: Zernio's `GET /v1/posts/{postId}` 404s for synced
   * (`source: external`) posts, which forced a 500-item list-and-scan workaround
   * (docs/ZERNIO-INTEGRATION.md). Meta has a real single-object endpoint, so no such workaround
   * is needed here.
   *
   * Returns null when Meta reports the media does not exist, so a deleted post renders as
   * "not found" rather than a 500. */
  async getMedia(mediaId: string): Promise<MetaPost | null> {
    try {
      const raw = await this.request<RawMedia>(`/${mediaId}`, { fields: MEDIA_FIELDS });
      return toMetaPost(raw);
    } catch (error) {
      if (error instanceof MetaApiError && error.status === 404) {
        return null;
      }
      // Meta answers "unknown object id" with a 400 + code 100 rather than a 404. Treated the
      // same way: the caller asked for something that is not there.
      if (
        error instanceof MetaApiError &&
        error.status === 400 &&
        error.body?.error?.code === 100
      ) {
        return null;
      }
      throw error;
    }
  }

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.accessToken) {
      // Lazy, not constructor-time, matching packages/zernio: an unconfigured token must not
      // take down health/readiness endpoints or the Zernio fallback path.
      throw new MetaApiError(path, 401, {
        error: { message: 'No Meta access token configured for this account.', code: 190 },
      });
    }

    const query = new URLSearchParams({ ...params, access_token: this.accessToken });
    const url = `${META_GRAPH_BASE_URL}/${META_GRAPH_VERSION}${path}?${query.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new MetaApiError(path, 504, {
          error: { message: `Meta did not respond within ${REQUEST_TIMEOUT_MS}ms.` },
        });
      }
      throw error;
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as MetaErrorBody | undefined;
      // `path`, never `url` - the URL carries the access token.
      throw new MetaApiError(path, response.status, body);
    }

    return (await response.json()) as T;
  }
}
