import { signInWithGoogleAction } from './actions';

/** "Continue with Google" (Phase 15.5, requirement 1), plus the divider above it.
 *
 * A server component wrapping a plain `<form action={serverAction}>`, so it works without
 * JavaScript and needs no client bundle of its own.
 *
 * Renders nothing at all when Google is not configured. `src/auth.ts` only registers the provider
 * when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, so showing the button in an
 * environment without them would offer a route that can only fail. The same condition is checked
 * in both places deliberately - the button must never appear without the provider behind it.
 */
export function GoogleButton({ label }: { label: string }) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-text-faint">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogleAction}>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2.5 rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text shadow-sm hover:bg-surface-2"
        >
          <GoogleGlyph />
          {label}
        </button>
      </form>
    </>
  );
}

/** Google's four-colour "G". Hard-coded hex rather than theme tokens on purpose: this is
 * another company's trademark, and it is the same mark in light and dark themes. */
function GoogleGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-[18px] w-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
