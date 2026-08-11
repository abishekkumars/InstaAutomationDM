'use client';

import { useActionState } from 'react';
import { createOrganizationAction, type CreateOrganizationActionResult } from './actions';

export function CreateOrganizationForm() {
  const [state, formAction, pending] = useActionState<
    CreateOrganizationActionResult | null,
    FormData
  >(createOrganizationAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-text">
          Organization name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text shadow-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-text">
          Slug
        </label>
        <input
          id="slug"
          name="slug"
          type="text"
          required
          className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text shadow-sm focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-muted">
          Lowercase letters, numbers, and hyphens only (e.g. <code>acme-inc</code>).
        </p>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Creating...' : 'Create organization'}
      </button>
    </form>
  );
}
