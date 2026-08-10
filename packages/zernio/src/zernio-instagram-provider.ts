import type { ConnectedInstagramAccount, InstagramProvider } from './instagram-provider';

// Base URL + auth scheme per docs/ZERNIO-INTEGRATION.md ("Authentication") - not used by any
// method yet (no live calls until Phase 8), kept here so the real HTTP client Phase 8 adds
// has a single place to read them from.
export const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

/**
 * Skeleton only, per Phase 7's scope (docs/IMPLEMENTATION-ROADMAP.md) - the table and this
 * interface exist, but no method here makes a real Zernio call yet. Every method is
 * implemented for real starting the phase named in its docstring, using
 * `docs/ZERNIO-INTEGRATION.md`'s researched (and, per `CLAUDE.md`, re-verified-before-use)
 * endpoint shapes - never invented here.
 */
export class ZernioInstagramProvider implements InstagramProvider {
  constructor(private readonly apiKey: string) {}

  // Fewer params than the interface declares - fine in TypeScript (any caller passing the
  // full argument list is still compatible), and avoids an unused-parameter lint error for
  // a stub that has nothing to do with its input yet.
  async connectAccount(): Promise<ConnectedInstagramAccount> {
    throw new Error('ZernioInstagramProvider.connectAccount is not implemented yet (Phase 8).');
  }
}
