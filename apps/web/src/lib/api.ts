import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { signInternalServiceToken } from '@automationdm/shared';
import { getApiUrl } from './env';
import { getSession } from './session';

// Server-side only (never called from a Client Component - there is no browser-safe way to
// hand out API_INTERNAL_SECRET). See docs/ARCHITECTURE.md's "Session verification (Phase 6)"
// section and packages/shared/src/internal-service-token.ts for why apps/api is called this
// way rather than apps/web reaching into Prisma directly for org data, and why this doesn't
// just forward Auth.js's own session cookie.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The authenticated caller, as the API needs to see them. Kept as a plain value rather than
 * read from cookies on demand so a cached wrapper can take it as an argument - anything that
 * reads cookies cannot run inside a cache boundary. */
export interface ApiCaller {
  sub: string;
  email: string;
}

/** Resolves the current session into an ApiCaller. Throws if unauthenticated. Memoized per
 * request, so N callApi calls in one render cost one session decrypt rather than N. */
export const currentCaller = cache(async (): Promise<ApiCaller> => {
  const session = await getSession();
  if (!session?.user) {
    throw new Error('callApi() used without an authenticated session.');
  }
  return { sub: session.user.id, email: session.user.email ?? '' };
});

/** Mints the short-lived internal service token. Deliberately NOT memoized: the token carries a
 * 60s expiry, so reusing one across a long-lived cache entry would hand apps/api an expired
 * credential. Callers that cache must mint inside the cached function, not outside it. */
export function authorizationHeaderFor(caller: ApiCaller): string {
  const secret = process.env.API_INTERNAL_SECRET;
  if (!secret) {
    throw new Error('API_INTERNAL_SECRET is not configured.');
  }
  return `Bearer ${signInternalServiceToken(caller, secret)}`;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export async function callApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const authorization = authorizationHeaderFor(await currentCaller());

  const response = await fetch(`${getApiUrl()}${path}`, {
    // Default to no-store, but BEFORE the spread so a caller can override it. It used to sit
    // after `...init`, which silently made every opt-in to caching a no-op.
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body: ApiErrorBody | null = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.message ?? `API request failed (${response.status}).`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Signals that a response arrived successfully but with degraded content, so it must be returned
 * to the caller without being written to the cache. Thrown from inside the cached function
 * because that is the only way to stop `unstable_cache` persisting a value - it caches whatever
 * resolves, and there is no "return but do not store" option. Caught immediately outside. */
class DegradedResponse<T> extends Error {
  constructor(readonly payload: T) {
    super('Response was degraded and will not be cached.');
  }
}

export interface CachedCallOptions<T> {
  /** Cache tags for invalidation. See lib/cache-tags.ts. */
  tags: string[];
  /** Seconds. Defaults to 60 - long enough to collapse a burst of navigation, short enough that
   * stale stats self-correct quickly even if nobody presses Sync. */
  revalidate?: number;
  /** Returns true when the payload is a successful-but-incomplete response that must not be
   * cached. apps/api deliberately degrades rather than failing when Zernio is unreachable (it
   * returns 200 with null stats), so without this a single upstream blip would be frozen into the
   * cache for the whole TTL. */
  isDegraded?: (data: T) => boolean;
}

/**
 * GET through apps/api, cached in the durable data cache and invalidated by tag.
 *
 * Three non-obvious constraints shaped this, all verified against the installed Next 16.3.0:
 *
 *  1. **Caching cannot live on the `fetch` inside `callApi`.** The fetch cache key includes
 *     request headers, and `signInternalServiceToken` mints a token with a 60s expiry on every
 *     call, so `iat`/`exp` differ each time, the Authorization header differs, and the entry
 *     would never be hit. Caching therefore sits one level up, where the key is explicit.
 *  2. **The cached function must not read cookies.** `currentCaller()` runs outside and the
 *     caller is passed in as an argument - which also scopes entries per user, so one user can
 *     never read another's cached response.
 *  3. **The token is minted inside.** Minting outside would bake a 60-second credential into an
 *     entry that outlives it; on a later hit apps/api would reject it as expired.
 *
 * `'use cache'` is deliberately not used: with the default cache handler it is in-memory per
 * instance and does not persist across requests on serverless, so it would not help here.
 */
export async function callApiCached<T>(path: string, options: CachedCallOptions<T>): Promise<T> {
  const caller = await currentCaller();

  // Built per call because `tags` and `revalidate` are fixed when the wrapper is created and vary
  // by call site. The cache key comes from keyParts plus the arguments, not from function
  // identity, so rebuilding the wrapper does not weaken or fragment the cache.
  const load = unstable_cache(
    async (targetPath: string, forCaller: ApiCaller): Promise<T> => {
      const data = await rawGet<T>(targetPath, forCaller);
      if (options.isDegraded?.(data)) {
        throw new DegradedResponse(data);
      }
      return data;
    },
    ['callApiCached', path],
    { tags: options.tags, revalidate: options.revalidate ?? 60 },
  );

  try {
    return await load(path, caller);
  } catch (error) {
    if (error instanceof DegradedResponse) {
      return error.payload as T;
    }
    throw error;
  }
}

/** The bare GET, with the token minted from an explicitly passed caller rather than from cookies,
 * so it is safe to call inside a cache boundary. */
async function rawGet<T>(path: string, caller: ApiCaller): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorizationHeaderFor(caller),
    },
  });

  if (!response.ok) {
    const body: ApiErrorBody | null = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.message ?? `API request failed (${response.status}).`,
    );
  }
  return (await response.json()) as T;
}
