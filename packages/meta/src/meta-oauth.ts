// Business Login for Instagram - the OAuth round trip that yields a long-lived Instagram user
// access token.
//
// Every URL, parameter name and grant type below was verified against Meta's live
// "Business Login for Instagram" documentation on 2026-08-19 before this file was written, per
// CLAUDE.md's rule against inventing third-party API behavior:
//
//   authorize        GET  https://www.instagram.com/oauth/authorize
//   code -> token    POST https://api.instagram.com/oauth/access_token
//   short -> long    GET  https://graph.instagram.com/access_token?grant_type=ig_exchange_token
//   refresh          GET  https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
//
// Note the three different hosts - they are not interchangeable, and the authorize step is the
// only one on www.instagram.com.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { MetaApiError } from './meta-instagram-client';

export const META_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
export const META_TOKEN_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token';
export const META_LONG_LIVED_TOKEN_URL = 'https://graph.instagram.com/access_token';
export const META_REFRESH_TOKEN_URL = 'https://graph.instagram.com/refresh_access_token';

const REQUEST_TIMEOUT_MS = 10_000;

/** This project only ever READS posts through Meta - comments, messages and publishing all stay
 * on Zernio (ADR 0009). The intent is `instagram_business_basic` alone, and nothing in this
 * codebase calls a Meta endpoint that needs the other two.
 *
 * They are requested anyway because Meta's app configuration does not allow removing them:
 * verified 2026-08-19 in App Dashboard > Instagram > API setup with Instagram login > Business
 * login settings, where `instagram_business_basic`, `instagram_business_manage_comments` and
 * `instagram_business_manage_messages` cannot be deselected. Requesting a subset of the
 * configured scopes makes the authorize call fail - and it fails as
 * "Invalid Request: Request parameters are invalid: Invalid redirect_uri", which points at the
 * wrong parameter entirely. Keep this list in sync with the dashboard, not with our appetite.
 *
 * See ADR 0009, "Amendment 2026-08-19". Do not narrow this back to one scope without first
 * re-checking the dashboard - the authorize call will start failing with an error that says
 * nothing about scopes. */
export const META_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
] as const;

/** Meta long-lived tokens last 60 days. Refreshed once inside this window rather than on the
 * last day, so a user who does not visit for a week does not come back to a dead connection. */
export const REFRESH_WHEN_DAYS_REMAINING = 7;

/** Meta refuses to refresh a token younger than 24 hours. A freshly minted token is already
 * good for 60 days, so this is only ever a no-op skip, never a failure worth surfacing. */
export const MIN_TOKEN_AGE_HOURS_BEFORE_REFRESH = 24;

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  /** Must match a redirect URI registered on the Meta app **exactly**, including scheme,
   * trailing slash and port. Meta rejects a near-match rather than normalising it. */
  redirectUri: string;
}

export interface LongLivedToken {
  accessToken: string;
  /** Absolute expiry, computed from Meta's relative `expires_in` at the moment of exchange. */
  expiresAt: Date;
}

interface RawTokenError {
  error_message?: string;
  error_type?: string;
  error?: { message?: string; code?: number };
}

/** How long a signed `state` stays valid. Long enough for a human to read Meta's consent
 * screen and decide, short enough that a leaked callback URL is not replayable later. */
const STATE_TTL_MS = 10 * 60 * 1000;

export interface MetaOAuthState {
  organizationId: string;
  instagramAccountId: string;
  /** The user who started the flow. Re-checked on callback so one member cannot complete a
   * connect another member began. */
  userId: string;
}

interface SignedStatePayload extends MetaOAuthState {
  /** Absolute expiry, epoch ms. */
  exp: number;
}

/** Signs the OAuth `state` parameter.
 *
 * `state` is the only thing standing between our callback and a CSRF: without it, an attacker
 * can hand a victim a callback URL carrying the attacker's own authorization code and bind the
 * attacker's Instagram account to the victim's organization. So it is signed, carries the
 * identity of who started the flow, and expires.
 *
 * Keyed on the Meta **app secret** rather than a new dedicated env var. That keeps this key
 * doing exactly one job - securing this Meta OAuth flow - which is the same "one key, one
 * cryptographic purpose" discipline packages/shared's internal service token follows when it
 * refuses to reuse AUTH_SECRET. */
export function signOAuthState(state: MetaOAuthState, appSecret: string): string {
  const payload: SignedStatePayload = { ...state, exp: Date.now() + STATE_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', appSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

/** Verifies and decodes a `state` that came back through the user's own browser.
 *
 * Throws on a bad signature, a malformed value, or an expired one. Never returns a partially
 * trusted result - the caller uses the returned ids to decide which organization gets the
 * connection, so "probably fine" is not a usable answer here. */
export function verifyOAuthState(raw: string, appSecret: string): MetaOAuthState {
  const parts = raw.split('.');
  const [encoded, signature] = parts;
  if (parts.length !== 2 || encoded === undefined || signature === undefined) {
    throw new Error('Malformed OAuth state.');
  }

  const expected = createHmac('sha256', appSecret).update(encoded).digest('base64url');

  // Constant-time: a byte-by-byte early return leaks how much of a forged signature was
  // correct, which is enough to forge one given enough attempts.
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new Error('OAuth state signature does not verify.');
  }

  let payload: SignedStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedStatePayload;
  } catch {
    throw new Error('Malformed OAuth state payload.');
  }

  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    throw new Error('OAuth state has expired.');
  }
  if (!payload.organizationId || !payload.instagramAccountId || !payload.userId) {
    throw new Error('OAuth state is missing required fields.');
  }

  return {
    organizationId: payload.organizationId,
    instagramAccountId: payload.instagramAccountId,
    userId: payload.userId,
  };
}

/** Builds the URL to send the user's browser to. */
export function buildAuthorizeUrl(config: MetaOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: META_SCOPES.join(','),
    state,
  });
  return `${META_AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchanges the authorization code for a short-lived token, then immediately upgrades it to a
 * long-lived one.
 *
 * The two steps are always performed together because a short-lived token is useless to this
 * project - it expires in about an hour, and nothing here runs often enough to rely on that. */
export async function exchangeCodeForLongLivedToken(
  config: MetaOAuthConfig,
  code: string,
): Promise<LongLivedToken> {
  const shortLived = await exchangeCode(config, code);
  return exchangeForLongLived(config, shortLived);
}

async function exchangeCode(config: MetaOAuthConfig, code: string): Promise<string> {
  // This one is a POST with form-encoded body, unlike every other call in this file. Sending it
  // as JSON returns a confusing 400 about a missing client_id.
  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code,
  });

  const raw = await request<{ access_token?: string; user_id?: string | number }>(
    META_TOKEN_EXCHANGE_URL,
    '/oauth/access_token',
    { method: 'POST', body },
  );

  if (!raw.access_token) {
    throw new MetaApiError('/oauth/access_token', 502, {
      error: { message: 'Meta returned no access_token for the authorization code.' },
    });
  }
  return raw.access_token;
}

async function exchangeForLongLived(
  config: MetaOAuthConfig,
  shortLivedToken: string,
): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: config.appSecret,
    access_token: shortLivedToken,
  });

  const raw = await request<{ access_token?: string; expires_in?: number }>(
    `${META_LONG_LIVED_TOKEN_URL}?${params.toString()}`,
    '/access_token',
  );

  if (!raw.access_token) {
    throw new MetaApiError('/access_token', 502, {
      error: { message: 'Meta returned no long-lived access_token.' },
    });
  }

  return { accessToken: raw.access_token, expiresAt: toExpiryDate(raw.expires_in) };
}

/** Extends a long-lived token by another 60 days.
 *
 * Meta requires the token to be unexpired and at least 24 hours old; the caller checks age
 * before calling. A failure here is not fatal on its own - the existing token keeps working
 * until its own expiry - but it does mean the connection is on a countdown, which is why the
 * caller marks it for reconnect rather than retrying silently forever. */
export async function refreshLongLivedToken(currentToken: string): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: currentToken,
  });

  const raw = await request<{ access_token?: string; expires_in?: number }>(
    `${META_REFRESH_TOKEN_URL}?${params.toString()}`,
    '/refresh_access_token',
  );

  if (!raw.access_token) {
    throw new MetaApiError('/refresh_access_token', 502, {
      error: { message: 'Meta returned no refreshed access_token.' },
    });
  }

  return { accessToken: raw.access_token, expiresAt: toExpiryDate(raw.expires_in) };
}

/** Meta reports `expires_in` in seconds. Falls back to 60 days - the documented lifetime - when
 * the field is missing, so a stored connection always has a usable expiry to reason about
 * rather than a null that every caller has to special-case. */
function toExpiryDate(expiresInSeconds: number | undefined): Date {
  const seconds =
    typeof expiresInSeconds === 'number' && expiresInSeconds > 0
      ? expiresInSeconds
      : 60 * 24 * 60 * 60;
  return new Date(Date.now() + seconds * 1000);
}

async function request<T>(
  url: string,
  /** Loggable path. The full `url` carries the app secret and/or an access token in its query
   * string, so it must never reach an error message. */
  safePath: string,
  init?: { method?: string; body?: URLSearchParams },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: init?.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      body: init?.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new MetaApiError(safePath, 504, {
        error: { message: `Meta did not respond within ${REQUEST_TIMEOUT_MS}ms.` },
      });
    }
    throw error;
  }

  if (!response.ok) {
    // The OAuth endpoints answer with `error_message`/`error_type` at the top level, while the
    // Graph endpoints nest under `error`. Normalised here so callers only learn one shape.
    const raw = (await response.json().catch(() => undefined)) as RawTokenError | undefined;
    throw new MetaApiError(safePath, response.status, {
      error: {
        message: raw?.error?.message ?? raw?.error_message ?? raw?.error_type,
        code: raw?.error?.code,
      },
    });
  }

  return (await response.json()) as T;
}
