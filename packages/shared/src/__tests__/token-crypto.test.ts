import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptToken, encryptToken } from '../token-crypto';

// The key is read at call time (see token-crypto.ts for why), so each test sets it directly and
// the original is restored - scripts/test.ps1 loads the repo's own .env into the process, and
// leaking a mutation would affect whatever test file ran next.
const ORIGINAL_KEY = process.env.META_TOKEN_ENCRYPTION_KEY;
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
const TOKEN = 'IGAAxxxxLONG-LIVED-INSTAGRAM-TOKEN';

beforeEach(() => {
  process.env.META_TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.META_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.META_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

describe('encryptToken / decryptToken', () => {
  it('round-trips a token', () => {
    expect(decryptToken(encryptToken(TOKEN))).toBe(TOKEN);
  });

  it('never stores the plaintext', () => {
    expect(encryptToken(TOKEN)).not.toContain(TOKEN);
  });

  it('produces a different ciphertext each time, because the IV is fresh per call', () => {
    // Reusing an IV under one key breaks GCM outright. Identical output for identical input
    // would be the visible symptom of that bug.
    expect(encryptToken(TOKEN)).not.toBe(encryptToken(TOKEN));
  });

  it('rejects a tampered ciphertext rather than returning altered plaintext', () => {
    const [version, iv, tag, ciphertext] = encryptToken(TOKEN).split('.');
    const bytes = Buffer.from(ciphertext ?? '', 'base64url');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;

    expect(() => decryptToken([version, iv, tag, bytes.toString('base64url')].join('.'))).toThrow();
  });

  it('rejects a value encrypted under a different key', () => {
    const stored = encryptToken(TOKEN);
    process.env.META_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

    expect(() => decryptToken(stored)).toThrow();
  });

  it('rejects a malformed stored value', () => {
    expect(() => decryptToken('not-a-token')).toThrow(/expected v1 format/);
    expect(() => decryptToken('v1.a.b.c')).toThrow(/malformed IV/);
  });

  it('fails loudly when the key is missing, rather than silently skipping encryption', () => {
    delete process.env.META_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken(TOKEN)).toThrow(/META_TOKEN_ENCRYPTION_KEY is not configured/);
  });

  it('rejects a key that is not 32 bytes', () => {
    process.env.META_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => encryptToken(TOKEN)).toThrow(/must be 32 bytes/);
  });
});
