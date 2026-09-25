import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Uses the Edge-safe authConfig (no Prisma/bcrypt) — see auth.config.ts for why.
export default NextAuth(authConfig).auth;

// Brand assets are excluded as well: the favicon, iOS/PWA icons, manifest and in-app logo are
// requested by the signed-out sign-in page (and by the browser itself, without cookies), and
// running them through auth would answer each with a redirect to /sign-in instead of the image.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|brand-mark.png|icons/|api/auth).*)',
  ],
};
