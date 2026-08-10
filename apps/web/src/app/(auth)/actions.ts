'use server';

import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { prisma } from '@automationdm/database';
import { credentialsSchema } from '@automationdm/validation';
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
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
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
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      authProvider: 'credentials',
      authProviderId: email,
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

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/sign-in' });
}
