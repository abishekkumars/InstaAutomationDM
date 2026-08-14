'use client';

import { useCallback, useEffect, useState } from 'react';

/** How often to check while the tab is visible. The session is a rolling 30-minute idle timeout
 * (auth.config.ts), so a minute of lag before the notice appears is immaterial - this exists to
 * stop someone typing into a form that can no longer be saved, not to be precise to the second. */
const POLL_INTERVAL_MS = 60_000;

/** Watches for the session expiring while the user sits on a page (Phase 15.6, requirement 10).
 *
 * Without this, an idle-timed-out session is invisible until the user tries to *do* something -
 * and because every mutation here is a server action, what they get is a failed submission or a
 * silent redirect after they have already typed something they now lose. This turns that into an
 * explicit, up-front notice.
 *
 * Checked against Auth.js's own `/api/auth/session` endpoint rather than a timer started at page
 * load, because a timer would be wrong in both directions: the session extends itself as the user
 * works (`updateAge`), and it can also end early if the cookie is cleared or `AUTH_SECRET` is
 * rotated. Asking the server is the only answer that is true in all three cases.
 *
 * Mounted only inside the signed-in shell, so it never polls on the sign-in page itself.
 */
export function SessionExpiryWatcher() {
  const [expired, setExpired] = useState(false);

  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', {
        // The whole point is to observe the *current* server state; a cached 200 from two
        // minutes ago would defeat it.
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        // A 5xx is a server problem, not proof the session ended. Staying quiet is the safe
        // failure: a spurious "you have been signed out" that clears on the next poll would
        // train people to dismiss the real one.
        return;
      }
      const session = (await response.json()) as { user?: unknown } | null;
      if (!session || !session.user) {
        setExpired(true);
      }
    } catch {
      // Offline, or the request was aborted by a navigation. Same reasoning as above - a dropped
      // connection is not an expired session.
    }
  }, []);

  useEffect(() => {
    if (expired) {
      // Stop polling once the notice is up: the answer cannot change back, and the only way out
      // of this state is signing in again.
      return;
    }

    const interval = setInterval(check, POLL_INTERVAL_MS);

    // Returning to a tab that has been in the background for hours is the single likeliest moment
    // for the session to have lapsed, and browsers throttle timers in hidden tabs - so check on
    // the way back rather than waiting up to a full interval for a throttled timer to catch up.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void check();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [check, expired]);

  if (!expired) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-body"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-ink-950/60 p-4"
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg">
        <h2 id="session-expired-title" className="text-base font-semibold text-text">
          Session expired
        </h2>
        <p id="session-expired-body" className="mt-1.5 text-sm text-text-muted">
          You have been signed out after a period of inactivity. Please sign in again to continue.
        </p>
        {/* Deliberately no "dismiss": there is nothing useful behind this dialog. Every action on
            the page would now fail, so offering to stay would only hide that fact. */}
        <a
          href="/sign-in"
          // A plain <a>, not next/link: this is a full document load on purpose. A client-side
          // navigation would keep the current React tree - including any cached server-component
          // payloads rendered for the previous session - alive underneath the new page.
          className="mt-4 block w-full rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-accent-ink hover:opacity-90"
        >
          Sign in again
        </a>
      </div>
    </div>
  );
}
