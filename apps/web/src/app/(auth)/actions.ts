'use server';

import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { prisma } from '@automationdm/database';
import { resolveRoleOnSignIn } from '@automationdm/shared';
import { credentialsSchema, registerSchema } from '@automationdm/validation';
import { signIn, signOut } from '@/auth';

export interface AuthActionResult {
  error: string;
}

const PASSWORD_HASH_COST = 12;

function firstIssueMessage(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? 'Invalid input.';
}

export async function signInAction(
  _prevState: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult | null> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error) };
  }

  try {
    await signIn('credentials', {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/',
    });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Invalid email or password.' };
    }
    // Auth.js's own `redirectTo` throws Next.js's internal redirect signal on success -
    // must propagate, not be swallowed as a failure.
    throw error;
  }
}

export async function registerAction(
  _prevState: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult | null> {
  // registerSchema, not credentialsSchema: the confirmation is re-checked here rather than being
  // trusted from the browser. A mismatched pair reaching this point means the form was bypassed,
  // and creating the account anyway would set a password the user does not think they chose.
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error) };
  }
  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: 'An account with that email already exists.' };
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_COST);
  // authProvider/authProviderId populated for the first time here - see
  // docs/ADR/0004-authentication-provider.md for why "credentials" + email is the right
  // mapping for a Credentials-only provider with no external subject id of its own.
  //
  // `role` is derived server-side from ADMIN_EMAIL and is never read from the submitted form
  // (Phase 15.1, requirement 20). A registration that posted `role=ADMIN` would be ignored:
  // credentialsSchema does not carry the field, so it cannot reach this call at all.
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      authProvider: 'credentials',
      authProviderId: email,
      role: resolveRoleOnSignIn(email, 'NORMAL_USER'),
    },
  });

  try {
    await signIn('credentials', { email, password, redirectTo: '/' });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Account created. Please sign in.' };
    }
    throw error;
  }
}

/** Starts Google's OAuth flow (Phase 15.5, requirement 1).
 *
 * No try/catch around `signIn`: it throws Next.js's internal redirect signal on the happy path,
 * and swallowing that would strand the user on the sign-in page having apparently done nothing.
 * A genuine provider failure is surfaced by Auth.js's own error page instead.
 */
export async function signInWithGoogleAction(): Promise<void> {
  await signIn('google', { redirectTo: '/' });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/sign-in' });
}
