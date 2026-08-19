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
  /** True when an existing Zernio profile with this name was reused rather than a new one
   * created. Lets apps/api tell "we adopted the profile that was already there" apart from
   * "we just created one", which matters for reconciling an organization whose local
   * zernioProfileId was lost or never persisted. */
  reused: boolean;
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
  /** Zernio's own post id.
   *
   * **Nullable since Phase 17.** A post sourced directly from Meta has no Zernio `_id` - Zernio
   * only mints one once its own poll-driven sync catches up, which can be hours after
   * publishing. Callers must key off `platformPostId` instead; this is retained only for
   * reconciling against Zernio's own automation records. See
   * docs/ADR/0009-direct-meta-graph-api-for-post-listing.md. */
  zernioPostId: string | null;
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
  /** Instagram's own media id - the pivot since Phase 17, replacing Zernio's `_id`. It is the
   * only identifier both the Meta and Zernio listing paths can produce. */
  platformPostId: string;
}

/** An inline DM button - title + link only. Zernio's real `DmButton` schema also supports
 * `type: postback | phone`; this project only ever sends `type: "url"` (see
 * docs/ZERNIO-INTEGRATION.md's "Comment-to-DM automation API" section for why), so the type
 * itself isn't part of this domain shape - ZernioInstagramProvider adds it back when calling
 * Zernio, and strips it back off when reading Zernio's response. */
export interface DmButton {
  title: string;
  url: string;
}

/** Which commenters an automation may answer, mirroring Zernio's `audience.followerStatus`
 * (Phase 16.2, requirement 11). Instagram only reveals the follow relationship for people who
 * have messaged the account before, so this is a filter Zernio applies on a best-effort basis -
 * see `audience.whenUnknown` in docs/ZERNIO-INTEGRATION.md. */
export type AutomationAudience = 'any' | 'follower' | 'non_follower';

export interface CreateCommentAutomationInput {
  zernioProfileId: string;
  zernioAccountId: string;
  /** Zernio's own post id (the `_id` from listPosts), sent as Zernio's `postId` field.
   *
   * **Optional since Phase 17, and this is load-bearing.** Zernio's spec marks `postId` as
   * "required only when also targeting a specific post via platformPostId", which this project
   * had read as mandatory. Verified by hand on 2026-08-19: a create carrying `platformPostId`
   * and no `postId` returns 201 and the automation **fires correctly on a real comment**.
   *
   * That is what makes a freshly published reel automatable at all - Zernio's `_id` does not
   * exist until its sync catches up hours later, while Instagram's media id is available from
   * Meta immediately. Omitted whenever the post came from Meta. */
  zernioPostId?: string;
  /** The *Instagram* media id (`InstagramPost.platformPostId`), which is what Zernio's
   * `platformPostId` field actually means ("Platform media/post ID"). These are two different
   * ids and must not be swapped: sending Zernio's own `_id` here creates an automation Zernio
   * scopes to a post id Instagram will never report on an incoming comment. Optional only
   * because Zernio's synced data can lack it; the caller rejects that case rather than
   * silently creating an account-wide automation. */
  platformPostId: string;
  name: string;
  /** Trigger keywords. **An empty array means "every comment triggers"** - Zernio's own
   * documented behaviour for an empty list ("empty = any comment triggers"), which is what the
   * create wizard's "Any comments" tab sends. `matchMode` is then irrelevant. */
  keywords: string[];
  matchMode: 'contains' | 'word' | 'exact';
  /** Restricts who gets answered (Phase 16.2). Omitted entirely when `'any'`, which is Zernio's
   * own default - see `toRawAudience`. */
  audience?: AutomationAudience;
  /** Optional public reply posted on the triggering comment - Zernio's own API treats this
   * as optional, not required. */
  commentReply?: string;
  /** Up to 5 alternate public replies. Zernio picks ONE at random per triggering comment from
   * `[commentReply, ...commentReplyVariations]` - it does not post all of them. */
  commentReplyVariations?: string[];
  /** Up to 3 (Zernio's own limit). Omit or pass an empty array for a plain-text DM. Attaching
   * any buttons lowers Zernio's own dmMessage length limit from ~1000 to 640 chars. */
  buttons?: DmButton[];
  dmMessage: string;
}

/** Live counters Zernio keeps per automation. **Only the list endpoint returns this richer
 * shape** - create/get return a smaller `{totalTriggered, totalSent, totalFailed}` object
 * instead (a real inconsistency in Zernio's own API, verified live in Phase 10.1, not
 * assumed). Every field is optional because of that: a CommentAutomation built from a create
 * response has no stats at all. */
export interface CommentAutomationStats {
  triggered: number;
  dmsSent: number;
  dmsFailed: number;
  uniqueContacts: number;
  /** DMs sent with a trackable (wrapped) link. Per Zernio's own spec this - NOT dmsSent - is
   * the correct CTR denominator, since a DM with no tracked link can never be clicked. */
  trackedSends: number;
  linkClicks: number;
  uniqueClicks: number;
}

/** A comment-to-DM automation as Zernio's API represents it - see
 * docs/ZERNIO-INTEGRATION.md's "Comment-to-DM automation API" section. Zernio itself executes
 * the keyword-matching, public reply, and DM send server-side (verified live during Phase
 * 10, resolving docs/AUTOMATION-ENGINE.md's "Open question") - this project never re-does
 * that matching locally. */
export interface CommentAutomation {
  zernioAutomationId: string;
  zernioAccountId: string | null;
  /** Zernio's own post id, from its `postId` field. Null for automations created before this
   * project started sending `postId`, and for account-wide ones. */
  zernioPostId: string | null;
  /** The Instagram media id, from Zernio's `platformPostId` field. Reconciliation matches on
   * this as well as `zernioPostId`, since historical automations may carry only one of the
   * two - see docs/ZERNIO-INTEGRATION.md. */
  platformPostId: string | null;
  name: string;
  /** Empty means "any comment triggers" - see CreateCommentAutomationInput.keywords. */
  keywords: string[];
  matchMode: 'contains' | 'word' | 'exact';
  audience: AutomationAudience;
  commentReply: string | null;
  /** Empty when the automation has a single fixed public reply. */
  commentReplyVariations: string[];
  buttons: DmButton[];
  dmMessage: string;
  isActive: boolean;
  /** Null when this automation came from a create/get response, which returns a different,
   * smaller stats shape - see CommentAutomationStats. */
  stats: CommentAutomationStats | null;
}

export interface ListCommentAutomationsInput {
  zernioProfileId: string;
}

/** A partial update. Every field is optional - Zernio's `PATCH` only touches what is sent,
 * leaving everything else on the automation as-is. The post binding (`platformPostId`) is
 * deliberately not updatable here: this project's model is one automation per post
 * (docs/AUTOMATION-ENGINE.md), so moving an automation to a different post would break the
 * local unique(instagramAccountId, zernioPostId) pairing rather than being a normal edit. */
export interface UpdateCommentAutomationInput {
  zernioAutomationId: string;
  name?: string;
  /** An empty array is meaningful here, not a no-op: it switches the automation to "any
   * comment triggers". */
  keywords?: string[];
  matchMode?: 'contains' | 'word' | 'exact';
  audience?: AutomationAudience;
  /** Empty string clears the public reply. */
  commentReply?: string;
  /** Pass an empty array to clear every variation, same convention as `buttons`. */
  commentReplyVariations?: string[];
  /** Pass an empty array to clear every button - Zernio's own documented way to remove them
   * (an omitted `buttons` key leaves the stored ones untouched instead). */
  buttons?: DmButton[];
  dmMessage?: string;
  /** Pause/resume without deleting. */
  isActive?: boolean;
}

export interface DeleteCommentAutomationInput {
  zernioAutomationId: string;
}

export interface InstagramProvider {
  /** Resolves the Zernio profile for an organization, creating one only if it doesn't
   * already exist. Idempotent on Zernio's side, not just the caller's: implementations must
   * look the profile up by name first (`GET /v1/profiles?name=`, an exact-match filter
   * Zernio's own spec documents for exactly this purpose) and only `POST /v1/profiles` when
   * that finds nothing - otherwise an organization whose local zernioProfileId was never
   * persisted (a crash between the create and the DB write) accumulates a second, duplicate
   * Zernio profile on every retry. `reused` reports which of the two paths ran. */
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

  /** Creates a comment-to-DM automation on Zernio (Phase 10). Rejects (via a 409-status
   * ZernioApiError) if this post already has an active per-post automation - Zernio's own
   * rule, mirrored locally by Automation's unique(instagramAccountId, zernioPostId). */
  createCommentAutomation(input: CreateCommentAutomationInput): Promise<CommentAutomation>;

  /** Lists every comment-to-DM automation on a profile (`GET /v1/comment-automations?profileId=`,
   * verified live against Zernio's OpenAPI spec). Zernio only filters by profileId - each item
   * carries its own `zernioAccountId`/`zernioPostId` for the caller to filter further. Used to
   * recover from a 409 on create (an automation already exists in Zernio for this post - either
   * created directly in Zernio's own dashboard, or a prior create() whose local DB insert failed
   * after the Zernio side already succeeded) by finding the real automation instead of leaving
   * the caller stuck with no way to see or reconcile it locally. */
  listCommentAutomations(input: ListCommentAutomationsInput): Promise<CommentAutomation[]>;

  /** Updates an existing automation (`PATCH /v1/comment-automations/{automationId}`, verified
   * against Zernio's live OpenAPI spec). Partial: only the fields passed are changed. Zernio
   * enforces the same 640-char dmMessage limit whenever the automation ends up with buttons
   * attached - including when the buttons were already stored and only the message changes. */
  updateCommentAutomation(input: UpdateCommentAutomationInput): Promise<CommentAutomation>;

  /** Permanently deletes an automation and all of its trigger logs
   * (`DELETE /v1/comment-automations/{automationId}`). Not reversible on Zernio's side. */
  deleteCommentAutomation(input: DeleteCommentAutomationInput): Promise<void>;
}
