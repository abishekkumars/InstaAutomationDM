import type { NextAuthConfig } from 'next-auth';
import { SESSION_MAX_AGE_SECONDS, renewSessionWindow } from '@automationdm/shared';

// Deliberately no providers/database access here: this config is imported by src/proxy.ts,
// which is kept free of Prisma and `bcryptjs`. src/auth.ts extends this with the real providers
// for every other context. See docs/ADR/0004-authentication-provider.md. (Next 16's proxy runs
// on the Node.js runtime, so the pure session-window rule from @automationdm/shared is fine here.)
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/status'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/sign-in',
  },
  session: {
    strategy: 'jwt',

    // Rolling idle timeout, per device (Phase 15.6; amended 2026-09-25, ADR 0008): 5 days on a
    // phone, 30 minutes everywhere else.
    //
    // With the JWT strategy `maxAge` is the token's own lifetime, and Auth.js re-issues the
    // cookie whenever the session is touched - so it behaves as an idle limit, not "signed out N
    // minutes after signing in". Auth.js allows only one maxAge, so it is set to the longest
    // limit (the phone's), and the `jwt` callback below enforces each device's own limit.
    maxAge: SESSION_MAX_AGE_SECONDS,

    // Only used by Auth.js's database-session strategy (checked in @auth/core's session action);
    // with JWT sessions the token is re-issued on every session read regardless, which is what
    // makes both idle limits roll. Kept at its original value so switching strategy later would
    // not silently fall back to the 24-hour default.
    updateAge: 5 * 60,
  },
  // Self-hosted (no Vercel-managed host detection) — see docs/DEVELOPMENT-SETUP.md and
  // docs/DEPLOYMENT.md for how the deployed origin is configured.
  trustHost: true,
  providers: [],
  callbacks: {
    /** Enforces the per-device idle limit on every session read, including the proxy's check of
     * every request. Returning null ends the session: Auth.js clears the cookie. auth.ts wraps
     * this to record the device at sign-in. */
    jwt({ token }) {
      return renewSessionWindow(token, Math.floor(Date.now() / 1000));
    },
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      if (isPublicPath(pathname)) {
        return true;
      }
      return isLoggedIn;
    },
  },
};
