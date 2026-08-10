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
