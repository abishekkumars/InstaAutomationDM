// Per-device session lifetime (ADR 0008, amendment 2026-09-25).
//
// Auth.js has one global `session.maxAge`. This app wants two idle limits: phones stay signed in
// for 5 days without use, while desktops keep the original 30 minutes. So the global maxAge is the
// longer of the two, and the per-device limit is enforced here, from the `jwt` callback, which
// Auth.js runs on every session read and which ends the session when it returns null.

/** Idle limit for a session started on a phone: 5 days. */
export const PHONE_SESSION_IDLE_SECONDS = 5 * 24 * 60 * 60;

/** Idle limit for every other device: 30 minutes, the original Phase 15.6 rule. */
export const DESKTOP_SESSION_IDLE_SECONDS = 30 * 60;

/** Auth.js `session.maxAge`: the cookie and token must outlive the longest idle limit, or a
 * phone session would be cut off by the token itself before its own limit applies. */
export const SESSION_MAX_AGE_SECONDS = Math.max(
  PHONE_SESSION_IDLE_SECONDS,
  DESKTOP_SESSION_IDLE_SECONDS,
);

/** The fields this rule keeps on the Auth.js JWT. Both are optional because tokens issued before
 * this change carry neither. */
export interface SessionWindowFields {
  /** Whether the session was started on a phone. Set once, at sign-in, and never changed: the
   * device a session belongs to does not change during its life. */
  phone?: boolean;
  /** Epoch seconds after which the session counts as idle and ends. */
  idleUntil?: number;
}

export function sessionIdleLimitSeconds(token: SessionWindowFields): number {
  return token.phone === true ? PHONE_SESSION_IDLE_SECONDS : DESKTOP_SESSION_IDLE_SECONDS;
}

/** One step of the rolling window, run on every session read.
 *
 * Returns null when the session has gone idle past its device's limit (Auth.js then clears the
 * cookie and the user is signed out), otherwise the token with its deadline moved forward to
 * `now + limit`. Any use of the app therefore renews the session in full.
 *
 * A token without `phone` counts as desktop, and one without `idleUntil` starts a fresh window.
 * That covers sessions issued before this rule existed: they behave exactly as before, 30 minutes
 * idle. A phone user gets the longer window from their next sign-in. */
export function renewSessionWindow<T extends object>(
  token: T & SessionWindowFields,
  nowSeconds: number,
): (T & SessionWindowFields & { idleUntil: number }) | null {
  if (typeof token.idleUntil === 'number' && nowSeconds > token.idleUntil) {
    return null;
  }
  return { ...token, idleUntil: nowSeconds + sessionIdleLimitSeconds(token) };
}
