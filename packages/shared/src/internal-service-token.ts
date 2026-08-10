import jwt from 'jsonwebtoken';

// Server-to-server auth for apps/web -> apps/api (Phase 6, multi-tenancy). apps/web mints
// one of these, server-side, immediately after checking the caller's Auth.js session; apps/
// api verifies it and never trusts anything else about the caller's identity.
//
// Deliberately NOT the Auth.js session cookie itself: that cookie is a JWE encoded via
// @auth/core's own HKDF-derived-key scheme, an internal implementation detail of a
// still-beta library (see docs/ADR/0004-authentication-provider.md) that apps/api has no
// business depending on. This token is a small, explicit, self-owned contract instead -
// signed with its own secret (API_INTERNAL_SECRET, distinct from Auth.js's AUTH_SECRET;
// reusing one key for two different cryptographic uses is avoided on purpose) and a short
// expiry, since it is minted fresh for each server-side call rather than stored/reused.
const ISSUER = 'automationdm-web';
const AUDIENCE = 'automationdm-api';
const EXPIRES_IN_SECONDS = 60;

export interface InternalServiceTokenPayload {
  /** User.id of the authenticated caller. */
  sub: string;
  email: string;
}

export function signInternalServiceToken(
  payload: InternalServiceTokenPayload,
  secret: string,
): string {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: EXPIRES_IN_SECONDS,
  });
}

export function verifyInternalServiceToken(
  token: string,
  secret: string,
): InternalServiceTokenPayload {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).sub !== 'string' ||
    typeof (decoded as Record<string, unknown>).email !== 'string'
  ) {
    throw new Error('Malformed internal service token payload.');
  }

  return { sub: (decoded as { sub: string }).sub, email: (decoded as { email: string }).email };
}
