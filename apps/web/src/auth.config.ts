import type { NextAuthConfig } from 'next-auth';

// Deliberately no providers/database access here: this config is imported by
// src/middleware.ts, which Next.js runs on the Edge runtime by default — Edge has no Node.js
// APIs, so it cannot load `@automationdm/database` (Prisma) or `bcryptjs`. src/auth.ts
// extends this with the real `Credentials` provider for every other (Node runtime) context.
// See docs/ADR/0004-authentication-provider.md.
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

    // Rolling 30-minute idle timeout (Phase 15.6, requirement 9).
    //
    // With the JWT strategy `maxAge` is the token's own lifetime, and Auth.js re-issues the
    // cookie whenever the session is touched - so this behaves as "30 minutes of genuine
    // inactivity", not "signed out 30 minutes after signing in". Someone working continuously is
    // never interrupted; a machine left unattended is signed out.
    maxAge: 30 * 60,

    // How often an otherwise-unchanged session is re-issued to extend that window. 0 would
    // rewrite the cookie on literally every request (wasteful, and it makes every response
    // uncacheable); the default 24h would be useless here, since a 30-minute token would expire
    // long before it was ever refreshed. Five minutes means at most 5 minutes of a user's
    // activity goes unrecorded against a 30-minute budget.
    updateAge: 5 * 60,
  },
  // Self-hosted (no Vercel-managed host detection) — see docs/DEVELOPMENT-SETUP.md and
  // docs/DEPLOYMENT.md for how the deployed origin is configured.
  trustHost: true,
  providers: [],
  callbacks: {
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
