import { describe, expect, it } from 'vitest';
import {
  DESKTOP_SESSION_IDLE_SECONDS,
  PHONE_SESSION_IDLE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  renewSessionWindow,
} from '../session-lifetime';

const NOW = 1_800_000_000;
const DAY = 24 * 60 * 60;

describe('renewSessionWindow', () => {
  it('gives a phone session 5 days and a desktop session 30 minutes', () => {
    expect(renewSessionWindow({ phone: true }, NOW)?.idleUntil).toBe(NOW + 5 * DAY);
    expect(renewSessionWindow({ phone: false }, NOW)?.idleUntil).toBe(NOW + 30 * 60);
  });

  it('renews a phone session back to a full 5 days whenever it is used', () => {
    const signedIn = renewSessionWindow({ phone: true }, NOW)!;
    const fourDaysLater = NOW + 4 * DAY;
    const renewed = renewSessionWindow(signedIn, fourDaysLater);
    expect(renewed?.idleUntil).toBe(fourDaysLater + 5 * DAY);
  });

  it('ends a phone session unused for more than 5 days', () => {
    const signedIn = renewSessionWindow({ phone: true }, NOW)!;
    expect(renewSessionWindow(signedIn, NOW + 5 * DAY)).not.toBeNull();
    expect(renewSessionWindow(signedIn, NOW + 5 * DAY + 1)).toBeNull();
  });

  it('keeps the 30-minute idle limit on desktop', () => {
    const signedIn = renewSessionWindow({ phone: false }, NOW)!;
    expect(renewSessionWindow(signedIn, NOW + 29 * 60)).not.toBeNull();
    expect(renewSessionWindow(signedIn, NOW + 31 * 60)).toBeNull();
  });

  it('treats a token from before this rule as a desktop session with a fresh window', () => {
    const legacy = { sub: 'user-1' };
    const renewed = renewSessionWindow(legacy, NOW);
    expect(renewed).toEqual({ sub: 'user-1', idleUntil: NOW + DESKTOP_SESSION_IDLE_SECONDS });
  });

  it('keeps every other token field untouched', () => {
    const token = { sub: 'user-1', email: 'a@example.com', phone: true };
    expect(renewSessionWindow(token, NOW)).toMatchObject(token);
  });

  it('sets the Auth.js max age to the longest idle limit', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(PHONE_SESSION_IDLE_SECONDS);
  });
});
