import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAdminEmail, resolveRoleOnSignIn } from '../user-role';

// ADMIN_EMAIL is read at call time (not captured at import), so each test sets it directly and
// the original value is restored afterwards - the repo's own .env is loaded into the process by
// scripts/test.ps1, and leaking a mutation here would affect whatever test file ran next.
const ORIGINAL_ADMIN_EMAIL = process.env.ADMIN_EMAIL;

beforeEach(() => {
  delete process.env.ADMIN_EMAIL;
});

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAIL === undefined) {
    delete process.env.ADMIN_EMAIL;
  } else {
    process.env.ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL;
  }
});

describe('isAdminEmail', () => {
  it('is false for everyone when ADMIN_EMAIL is unset', () => {
    expect(isAdminEmail('alice@example.com')).toBe(false);
  });

  it('is false for everyone when ADMIN_EMAIL is blank', () => {
    process.env.ADMIN_EMAIL = '   ';
    expect(isAdminEmail('alice@example.com')).toBe(false);
    // The case that motivated trimming rather than a bare truthiness check: a blank
    // ADMIN_EMAIL must not match a caller who somehow presents a blank email.
    expect(isAdminEmail('')).toBe(false);
  });

  it('matches the configured address exactly', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminEmail('admin@example.com')).toBe(true);
    expect(isAdminEmail('someone@example.com')).toBe(false);
  });

  it('ignores case and surrounding whitespace on both sides', () => {
    process.env.ADMIN_EMAIL = '  Admin@Example.COM ';
    expect(isAdminEmail('admin@example.com')).toBe(true);
    expect(isAdminEmail(' ADMIN@example.com  ')).toBe(true);
  });

  it('does not treat a prefix or suffix as a match', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminEmail('admin@example.com.attacker.test')).toBe(false);
    expect(isAdminEmail('notadmin@example.com')).toBe(false);
  });
});

describe('resolveRoleOnSignIn', () => {
  it('promotes the configured bootstrap admin', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(resolveRoleOnSignIn('admin@example.com', 'NORMAL_USER')).toBe('ADMIN');
  });

  it('leaves an ordinary user alone', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(resolveRoleOnSignIn('alice@example.com', 'NORMAL_USER')).toBe('NORMAL_USER');
  });

  // The rule this function exists for. An admin granted through the Phase 15.2 Administration
  // UI is not ADMIN_EMAIL, so a "recompute from ADMIN_EMAIL" implementation would silently
  // demote them on their next sign-in and make the grant look broken.
  it('never demotes an admin who was granted the role explicitly', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(resolveRoleOnSignIn('alice@example.com', 'ADMIN')).toBe('ADMIN');
  });

  it('never demotes anyone when ADMIN_EMAIL is unset', () => {
    expect(resolveRoleOnSignIn('alice@example.com', 'ADMIN')).toBe('ADMIN');
    expect(resolveRoleOnSignIn('alice@example.com', 'NORMAL_USER')).toBe('NORMAL_USER');
  });

  it('does not demote the previous holder when ADMIN_EMAIL is repointed', () => {
    process.env.ADMIN_EMAIL = 'newadmin@example.com';
    expect(resolveRoleOnSignIn('oldadmin@example.com', 'ADMIN')).toBe('ADMIN');
    expect(resolveRoleOnSignIn('newadmin@example.com', 'NORMAL_USER')).toBe('ADMIN');
  });
});
