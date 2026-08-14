import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { prisma } from '@automationdm/database';
import { resolveRoleOnSignIn } from '@automationdm/shared';
import { credentialsSchema } from '@automationdm/validation';
import { authConfig } from './auth.config';

/** Google sign-in is configured only when both credentials are present (Phase 15.5,
 * requirement 1).
 *
 * Auth.js throws at import time if a provider is registered without its client id/secret, which
 * would take down sign-in entirely - including the credentials provider that works perfectly
 * well. Gating on the variables means an environment that has not set up a Google OAuth client
 * simply has no Google button, rather than no authentication at all.
 *
 * `next-auth/providers/google` is all this needs; the `googleapis` SDK is unrelated (that is a
 * Google *API* client, used by the database-backup script). */
const googleProviders =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          // Force the account chooser rather than silently reusing whichever Google account the
          // browser happens to be signed into - on a shared machine that is how someone ends up
          // authenticated as a colleague without noticing.
          authorization: { params: { prompt: 'select_account' } },
        }),
      ]
    : [];

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    ...googleProviders,
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          return null;
        }

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) {
          return null;
        }

        // Re-apply the ADMIN_EMAIL bootstrap on every successful sign-in, so pointing that
        // variable at an existing account promotes it without anyone touching the database by
        // hand. Deliberately AFTER the password check - an unauthenticated caller must not be
        // able to provoke a write by guessing the admin's address. resolveRoleOnSignIn only
        // ever promotes; see its own doc comment for why demotion is not symmetric.
        const role = resolveRoleOnSignIn(user.email, user.role);
        if (role !== user.role) {
          await prisma.user.update({ where: { id: user.id }, data: { role } });
        }

        // `role` is intentionally NOT returned into the session/JWT. apps/api re-reads it from
        // the database on every request (see its SessionGuard), so a copy here would be a
        // second, staler source of truth for an authorization decision - exactly what Phase
        // 15.1 set out to avoid.
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    /** Maps a Google identity onto a row in our own `users` table (Phase 15.5).
     *
     * This project has no Auth.js database adapter - the session is a JWT and `users` is written
     * by this app directly (docs/ADR/0004) - so nothing creates that row unless it happens here.
     *
     * The load-bearing line is `user.id = record.id`. Auth.js hands this callback Google's own
     * subject id, and the `jwt` callback below copies `user.id` into `token.sub`, which is what
     * `apps/web` sends to `apps/api` and what `SessionGuard` looks up. Leaving Google's id there
     * would mean every API call resolved to a user that does not exist - a 401 on every request,
     * for an otherwise perfectly successful sign-in. Overwriting it with our own primary key is
     * what makes the two halves agree.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google') {
        // The credentials provider already resolved and returned a real user in `authorize()`.
        return true;
      }

      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return false;
      }

      // Accounts are linked by email, so an *unverified* Google email must never be accepted:
      // that is the one path by which someone could sign in as an existing user by registering a
      // Google account claiming their address. Google sets this itself; we are only refusing to
      // ignore it.
      if (profile && profile.email_verified === false) {
        return false;
      }

      const existing = await prisma.user.findUnique({ where: { email } });

      if (existing) {
        const role = resolveRoleOnSignIn(email, existing.role);
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role,
            // Adopt the Google identity only if this account has no provider recorded yet - an
            // account created by the credentials flow keeps `authProvider: "credentials"` and its
            // password, so the same person can still sign in either way.
            ...(existing.authProviderId
              ? {}
              : { authProvider: 'google', authProviderId: account.providerAccountId }),
            // Fill in a display name if Google supplied one and we have none.
            ...(existing.name ? {} : { name: user.name ?? undefined }),
          },
        });
        user.id = existing.id;
        return true;
      }

      const created = await prisma.user.create({
        data: {
          email,
          name: user.name ?? undefined,
          authProvider: 'google',
          authProviderId: account.providerAccountId,
          // No passwordHash: a Google-created account has no password of its own, which is
          // exactly why that column is nullable (docs/DATABASE.md's `User` notes).
          role: resolveRoleOnSignIn(email, 'NORMAL_USER'),
        },
      });
      user.id = created.id;
      return true;
    },

    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
