import { describe, expect, it, vi } from 'vitest';
import { META_SCOPES, buildAuthorizeUrl, signOAuthState, verifyOAuthState } from '../meta-oauth';

const SECRET = 'meta-app-secret';
const STATE = { organizationId: 'org_1', instagramAccountId: 'acct_1', userId: 'user_1' };

describe('buildAuthorizeUrl', () => {
  it('targets www.instagram.com and requests exactly the dashboard-configured scopes', () => {
    const url = new URL(
      buildAuthorizeUrl({ appId: 'app', appSecret: SECRET, redirectUri: 'https://x/cb' }, 's'),
    );

    // The authorize step is the ONLY one on www.instagram.com - the other three hosts differ.
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x/cb');

    // Must equal the app's configured scope set, not the smaller set this project actually
    // exercises. Meta rejects a subset of the configured scopes, and does so as
    // "Invalid redirect_uri" - so narrowing this breaks connect with a misleading error.
    // ADR 0009, "Amendment 2026-08-19".
    expect(META_SCOPES).toEqual([
      'instagram_business_basic',
      'instagram_business_manage_comments',
      'instagram_business_manage_messages',
    ]);
    expect(url.searchParams.get('scope')).toBe(
      'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages',
    );

    // Never requested: this project does not publish or read insights through Meta (ADR 0009).
    expect(url.searchParams.get('scope')).not.toContain('content_publish');
    expect(url.searchParams.get('scope')).not.toContain('manage_insights');
  });
});

describe('OAuth state', () => {
  it('round-trips the identity of whoever started the flow', () => {
    expect(verifyOAuthState(signOAuthState(STATE, SECRET), SECRET)).toEqual(STATE);
  });

  it('rejects a state signed with a different secret', () => {
    // This is the CSRF case: without it, an attacker hands a victim a callback URL carrying the
    // attacker's authorization code and binds their Instagram account to the victim's org.
    expect(() => verifyOAuthState(signOAuthState(STATE, SECRET), 'other')).toThrow(
      /does not verify/,
    );
  });

  it('rejects a tampered payload even when the shape is still valid', () => {
    const signed = signOAuthState(STATE, SECRET);
    const forged = Buffer.from(
      JSON.stringify({ ...STATE, organizationId: 'org_victim', exp: Date.now() + 60_000 }),
      'utf8',
    ).toString('base64url');

    expect(() => verifyOAuthState(`${forged}.${signed.split('.')[1]}`, SECRET)).toThrow();
  });

  it('rejects an expired state', () => {
    const signed = signOAuthState(STATE, SECRET);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      expect(() => verifyOAuthState(signed, SECRET)).toThrow(/expired/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects malformed input rather than parsing it optimistically', () => {
    expect(() => verifyOAuthState('nonsense', SECRET)).toThrow(/Malformed/);
    expect(() => verifyOAuthState('a.b.c', SECRET)).toThrow(/Malformed/);
  });
});
