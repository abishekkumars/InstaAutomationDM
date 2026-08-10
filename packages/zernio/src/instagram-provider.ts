// Domain-shaped abstraction boundary - see docs/ZERNIO-INTEGRATION.md. Nothing outside this
// package calls Zernio directly, and this interface never leaks Zernio's own request/
// response shapes; only ZernioInstagramProvider (zernio-instagram-provider.ts) knows what an
// actual Zernio API call looks like.

export interface ConnectedInstagramAccount {
  /** Zernio's own account/profile identifier - what packages/database's InstagramAccount.zernioAccountId stores. */
  zernioAccountId: string;
  username: string | null;
}

export interface InstagramProvider {
  /**
   * Exchanges an OAuth authorization code for a connected Instagram account. Implemented
   * starting Phase 8 - see docs/ZERNIO-INTEGRATION.md's "Account connection" section for the
   * two OAuth paths Zernio supports (Direct Instagram Login vs Facebook Login) and the
   * Business/Creator-account-only constraint.
   */
  connectAccount(input: { code: string; redirectUri: string }): Promise<ConnectedInstagramAccount>;
}
