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
}
