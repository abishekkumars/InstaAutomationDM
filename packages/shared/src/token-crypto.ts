import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Symmetric encryption for third-party access tokens held at rest (Phase 17).
//
// Until now this project stored no third-party token at all - Zernio holds the Instagram
// credentials and never hands them over, which is why docs/SECURITY.md previously had no
// encrypted-at-rest requirement. The Meta connection (docs/ADR/0009) changes that: a live
// Instagram user access token now sits in our own `meta_connections` table, and a database
// dump or a stray query result would otherwise expose a credential that is valid for 60 days
// and can read the account's entire media library.
//
// AES-256-GCM specifically, not CBC: GCM is authenticated, so a tampered ciphertext fails to
// decrypt rather than silently yielding attacker-influenced plaintext.

/** 96 bits is the GCM-recommended nonce length - it is what the mode is specified around, and
 * longer nonces are hashed down internally with no security benefit. */
const IV_LENGTH = 12;

/** GCM's authentication tag. 128 bits is the maximum and the default. */
const AUTH_TAG_LENGTH = 16;

const ALGORITHM = 'aes-256-gcm';

/** Marks the format so a future migration to a different scheme can tell stored values apart
 * instead of guessing from length. */
const VERSION = 'v1';

/** Reads and validates the key at call time, not at module load.
 *
 * Call time matters: `apps/api`'s health and readiness endpoints must keep answering on a
 * deployment where this variable was never set, and the Zernio fallback path must keep working
 * for organizations that have no Meta connection at all. A module-level throw would take the
 * whole process down instead. Same lazy-check reasoning as packages/zernio's API key. */
function getKey(): Buffer {
  const raw = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'META_TOKEN_ENCRYPTION_KEY is not configured. It is required to read or write Meta access tokens.',
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `META_TOKEN_ENCRYPTION_KEY must be 32 bytes (256 bits) base64-encoded; got ${key.length} bytes.`,
    );
  }
  return key;
}

/** Encrypts a token for storage.
 *
 * Output format is `v1.<iv>.<authTag>.<ciphertext>`, all base64url. Everything needed to
 * decrypt except the key travels with the value, so the column is self-contained and no
 * separate IV column has to be kept in sync with it.
 *
 * A fresh random IV per call is not optional - reusing an IV under the same key in GCM breaks
 * the mode outright, leaking plaintext relationships and the authentication key. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Decrypts a stored token.
 *
 * Throws on any tampering, truncation, or wrong key - GCM's tag check is what makes that
 * possible, and the failure is deliberately not softened into a null return. A caller that
 * silently treated an unreadable token as "no connection" would quietly downgrade every
 * account to the Zernio fallback the moment the key was rotated wrong, which looks like a
 * product bug rather than a configuration error. */
export function decryptToken(stored: string): string {
  const [version, ivPart, authTagPart, ciphertextPart] = stored.split('.');
  if (
    version !== VERSION ||
    ivPart === undefined ||
    authTagPart === undefined ||
    ciphertextPart === undefined
  ) {
    throw new Error('Stored Meta token is not in the expected v1 format.');
  }

  const iv = Buffer.from(ivPart, 'base64url');
  const authTag = Buffer.from(authTagPart, 'base64url');
  const ciphertext = Buffer.from(ciphertextPart, 'base64url');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Stored Meta token has a malformed IV or authentication tag.');
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
