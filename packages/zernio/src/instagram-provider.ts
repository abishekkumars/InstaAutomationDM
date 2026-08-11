// Domain-shaped abstraction boundary - see docs/ZERNIO-INTEGRATION.md. Nothing outside this
// package calls Zernio directly, and this interface never leaks Zernio's own request/
// response shapes; only ZernioInstagramProvider (zernio-instagram-provider.ts) knows what an
// actual Zernio API call looks like.
//
// Phase 7's original shape here - connectAccount(code, redirectUri), a generic OAuth-
// authorization-code exchange - turned out not to match Zernio's real API once verified
// against its live docs in Phase 8: Zernio does not hand us an authorization code to
// exchange at all. Instead Zernio is tenant-scoped by its own "profile" concept (one profile
// per end customer - see docs/ZERNIO-INTEGRATION.md), hosts the entire OAuth round trip
// itself, and simply tells us (via a redirect, and independently checkable via
// findConnectedAccount) which account ended up connected to which profile. Replaced with the
// three methods that shape actually needs, per CLAUDE.md's "never invent Zernio API
// behavior" rule.

export interface EnsureProfileInput {
  /** Used as the new Zernio profile's name. Our Organization.slug - already globally unique
   * in our own system, which keeps profile-name collisions in Zernio's single workspace
   * unlikely without inventing a separate naming scheme. */
  name: string;
}

export interface EnsureProfileResult {
  /** Zernio's profile _id - what packages/database's Organization.zernioProfileId stores. */
  zernioProfileId: string;
}

export interface GetConnectUrlInput {
  zernioProfileId: string;
  /** Where Zernio redirects the browser once the connection completes. */
  redirectUrl: string;
}

export interface GetConnectUrlResult {
  /** URL to redirect the user's browser to for OAuth authorization. */
  authUrl: string;
}

export interface FindConnectedAccountInput {
  zernioProfileId: string;
}

export interface ConnectedInstagramAccount {
  /** Zernio's own account identifier - what packages/database's InstagramAccount.zernioAccountId stores. */
  zernioAccountId: string;
  username: string | null;
}

export interface ListPostsInput {
  zernioProfileId: string;
  zernioAccountId: string;
  /** 1-based, matches Zernio's own `page` query param. */
  page: number;
  limit: number;
}

/** One post/reel as Zernio's Instagram sync represents it (`GET /v1/posts`, `source: external`
 * - i.e. existing content published on Instagram outside Zernio, not something authored
 * through Zernio's own publishing tool, which this project has no feature for). A Reel is
 * just a video-`mediaType` post on Instagram's own model; Zernio does not expose a separate
 * "is this a reel" flag, so none is invented here. */
export interface InstagramPost {
  zernioPostId: string;
  /** Which Zernio account this post is published under. Verified against ZernioInstagramProvider
   * before returning post data to a caller, the same "never trust an unscoped id" discipline as
   * Phase 8's callback handler - see getPost's doc comment below for why this still matters even
   * though listPosts (the underlying call) is itself already accountId-scoped. */
  zernioAccountId: string | null;
  platformPostId: string | null;
  /** Public Instagram permalink, when Zernio has it. */
  permalink: string | null;
  caption: string;
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

export interface ListPostsResult {
  posts: InstagramPost[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface GetPostInput {
  zernioProfileId: string;
  zernioAccountId: string;
  zernioPostId: string;
}

export interface InstagramProvider {
  /** Creates the Zernio profile for an organization that doesn't have one yet. Idempotent
   * from the caller's side: apps/api only calls this once per organization and persists the
   * result on Organization.zernioProfileId. */
  ensureProfile(input: EnsureProfileInput): Promise<EnsureProfileResult>;

  /** Gets the OAuth URL to redirect the user's browser to, for the default (no secondary
   * selection step) Instagram Login flow. */
  getConnectUrl(input: GetConnectUrlInput): Promise<GetConnectUrlResult>;

  /** Independently confirms (via a live Zernio call, not by trusting redirect query params)
   * which Instagram account, if any, is connected to a given profile. */
  findConnectedAccount(input: FindConnectedAccountInput): Promise<ConnectedInstagramAccount | null>;

  /** Lists an Instagram account's existing posts/reels (Phase 9) - see docs/ZERNIO-INTEGRATION.md's
   * "Listing posts/reels" section for the real, verified endpoint this wraps. */
  listPosts(input: ListPostsInput): Promise<ListPostsResult>;

  /** Fetches a single post/reel by Zernio's own post id. Verified live during Phase 9:
   * Zernio's `GET /v1/posts/{postId}` does NOT work for `source: external` (synced) posts -
   * it 404s even for an id taken directly from a real listPosts response, with or without
   * profileId/source query params. Implementations must instead search a listPosts call for
   * the matching id, per docs/ZERNIO-INTEGRATION.md's "Listing posts/reels" section. */
  getPost(input: GetPostInput): Promise<InstagramPost | null>;
}
