'use client';

import { useEffect } from 'react';

/** Route-level error boundary.
 *
 * Required alongside the Suspense boundaries added for streaming: once a response has started
 * streaming, an exception thrown while rendering a boundary can no longer become an error status
 * code, so without this the user would get a blank or truncated page. This renders a recoverable
 * message with `reset()` instead.
 *
 * Must be a Client Component - that is a framework requirement for error boundaries.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side causes are already logged by apps/web's own console.error in the server
    // actions and by apps/api's exception filter. This covers render-time failures, which
    // otherwise leave nothing behind to debug from.
    console.error('[dashboard] render failed:', error);
  }, [error]);

  return (
    <div className="rounded-xl border border-danger/30 bg-danger-bg p-5">
      <h2 className="font-medium text-danger">Something went wrong</h2>
      <p className="mt-1 text-sm text-danger/90">
        This page could not be loaded. It is usually a temporary problem reaching the API.
      </p>
      {error.digest && <p className="mt-2 text-xs text-danger/70">Reference: {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
