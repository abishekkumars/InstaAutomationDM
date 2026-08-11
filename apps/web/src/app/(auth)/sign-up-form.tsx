'use client';

import { useActionState } from 'react';
import { LoadingOverlay } from '../loader';
import { registerAction, type AuthActionResult } from './actions';

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<AuthActionResult | null, FormData>(
    registerAction,
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
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-text">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text shadow-sm focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-muted">At least 8 characters.</p>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  );
}
