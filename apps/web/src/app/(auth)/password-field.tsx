'use client';

import { useId, useState } from 'react';

/** A password input with a show/hide toggle (Phase 15.4, requirement 3).
 *
 * Shared by both auth forms so the toggle, the accessible labelling and the field styling cannot
 * drift between sign-in and sign-up - the sign-up page renders two of these, and having them
 * behave differently from the sign-in one would be the obvious way for that to go wrong.
 *
 * Each instance owns its own visibility state on purpose: on the sign-up form, revealing the
 * password should not also reveal the confirmation. Checking that the two *match* is the point of
 * the second field, and a shared toggle would let someone confirm a typo by sight rather than by
 * typing it twice.
 */
export function PasswordField({
  name,
  label,
  autoComplete,
  hint,
  minLength,
}: {
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  // useId rather than the name: the id has to be unique in the document, and "password" and
  // "confirmPassword" both rendering a label htmlFor="password" would point both labels at the
  // first input.
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          name={name}
          // The whole feature: swapping this attribute is what reveals the value. The input keeps
          // its name and value across the swap, so toggling mid-entry never clears what was typed.
          type={visible ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          // pr-11 leaves room for the button so a long password never runs underneath it.
          className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-11 text-sm text-text shadow-sm focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          // Without type="button" this would submit the form - the default for a button inside a
          // form is type="submit".
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          // tabIndex -1 keeps Tab going straight from the password field to the next field or the
          // submit button, which is what someone typing a password expects. The control is still
          // reachable by click, and screen readers still announce it.
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-text-faint hover:text-text"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

// Local to this file rather than app/icons.tsx: that module is imported by the signed-in shell,
// and these two glyphs are only ever used on the two auth pages.
function EyeIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9M6.6 6.6A17.6 17.6 0 0 0 2 13s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1" />
      <path d="m2 2 20 20" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
