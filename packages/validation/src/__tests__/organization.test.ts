import { describe, expect, it } from 'vitest';
import {
  SLUG_MAX_LENGTH,
  SLUG_PATTERN,
  createOrganizationSchema,
  slugFromEmail,
} from '../organization';

describe('slugFromEmail', () => {
  it('uses the local part of the address', () => {
    expect(slugFromEmail('john@example.com')).toBe('john');
  });

  it('turns disallowed characters into separators rather than dropping them', () => {
    // `johndoe` would be actively misleading - two different people's addresses could
    // collapse onto the same slug that way.
    expect(slugFromEmail('john.doe@example.com')).toBe('john-doe');
    expect(slugFromEmail('john+newsletter@example.com')).toBe('john-newsletter');
    expect(slugFromEmail('john_doe@example.com')).toBe('john-doe');
  });

  it('lowercases', () => {
    expect(slugFromEmail('John.Doe@Example.COM')).toBe('john-doe');
  });

  it('collapses runs of separators and trims the ends', () => {
    expect(slugFromEmail('.john..doe.@example.com')).toBe('john-doe');
    expect(slugFromEmail('--john--@example.com')).toBe('john');
  });

  it('keeps digits', () => {
    expect(slugFromEmail('john99@example.com')).toBe('john99');
    expect(slugFromEmail('99@example.com')).toBe('99');
  });

  it('falls back when the local part has no usable characters', () => {
    expect(slugFromEmail('...@example.com')).toBe('user');
    expect(slugFromEmail('@example.com')).toBe('user');
  });

  it('handles an input with no @ at all without throwing', () => {
    expect(slugFromEmail('bare-string')).toBe('bare-string');
    expect(slugFromEmail('')).toBe('user');
  });

  it('truncates to the schema maximum without leaving a trailing hyphen', () => {
    // Chosen so the cut lands exactly on a separator - the case that reintroduces a trailing
    // hyphen if the second trim is removed.
    const local = `${'a'.repeat(SLUG_MAX_LENGTH - 1)}_bbbb`;
    const slug = slugFromEmail(`${local}@example.com`);

    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  // The guarantee the callers rely on: whatever comes out can be fed straight into the schema.
  // Collision handling is the caller's job (see AdminService.allocateSlug) - this only
  // promises a *well-formed* candidate.
  it.each([
    'john@example.com',
    'john.doe@example.com',
    'John+tag@Example.com',
    '...@example.com',
    '99@example.com',
    '_@example.com',
    `${'x'.repeat(120)}@example.com`,
    'a.b.c.d.e.f@example.com',
  ])('produces a slug the organization schema accepts: %s', (email) => {
    const slug = slugFromEmail(email);

    expect(slug).toMatch(SLUG_PATTERN);
    expect(createOrganizationSchema.safeParse({ name: 'Test Organization', slug }).success).toBe(
      true,
    );
  });
});
