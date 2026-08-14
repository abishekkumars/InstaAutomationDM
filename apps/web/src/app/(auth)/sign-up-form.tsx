'use client';

import { useActionState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@automationdm/validation';
import { LoadingOverlay } from '../loader';
import { PasswordField } from './password-field';
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
      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />
      {/* No minLength here: the confirmation is checked for *equality*, and a browser-level
          "too short" tooltip on this field would be a confusing way to report that the password
          above is the one that is too short. registerSchema reports the real mismatch. */}
      <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" />
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
