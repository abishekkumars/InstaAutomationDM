import { describe, expect, it } from 'vitest';
import { pickActiveOrganization } from '../active-organization';

const alpha = { id: 'org_alpha', name: 'Alpha' };
const beta = { id: 'org_beta', name: 'Beta' };

describe('pickActiveOrganization', () => {
  it('returns the preferred organization when the caller belongs to it', () => {
    expect(pickActiveOrganization([alpha, beta], 'org_beta')).toBe(beta);
  });

  it('falls back to the first membership when there is no preference', () => {
    expect(pickActiveOrganization([alpha, beta], undefined)).toBe(alpha);
    expect(pickActiveOrganization([alpha, beta], null)).toBe(alpha);
    expect(pickActiveOrganization([alpha, beta], '')).toBe(alpha);
  });

  it('ignores a preference for an organization the caller does not belong to', () => {
    // A removed membership, or a cookie edited by hand - never trusted, never an error.
    expect(pickActiveOrganization([alpha, beta], 'org_someone_else')).toBe(alpha);
  });

  it('returns null when the caller has no memberships at all', () => {
    expect(pickActiveOrganization([], 'org_alpha')).toBeNull();
  });
});
