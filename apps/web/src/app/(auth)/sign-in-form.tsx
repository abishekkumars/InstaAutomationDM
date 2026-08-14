'use client';

import { useActionState } from 'react';
import { LoadingOverlay } from '../loader';
import { PasswordField } from './password-field';
import { signInAction, type AuthActionResult } from './actions';

export function SignInForm() {
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(
    signInAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      {pending && <LoadingOverlay />}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-text">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text shadow-sm focus:border-accent focus:outline-none"
        />
      </div>
      <PasswordField name="password" label="Password" autoComplete="current-password" />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
