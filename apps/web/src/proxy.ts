import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Uses the Edge-safe authConfig (no Prisma/bcrypt) — see auth.config.ts for why.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
