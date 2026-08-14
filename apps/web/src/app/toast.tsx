'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type ToastTone = 'success' | 'warning' | 'error';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const DISMISS_AFTER_MS: Record<ToastTone, number> = {
  // Errors stay until dismissed: they usually mean the user has to do something, and a message
  // that vanishes before it is read is worse than no message. Success is transient by nature.
  success: 4000,
  warning: 6000,
  error: 0,
};

/** Maps a status value onto a toast, keyed by which param carried it. Both namespaces use the
 * bare value `error`, so they cannot share one flat table - `?instagram=error` and
 * `?automation=error` mean entirely different things. These are the exact values the server
 * actions already redirect with, so the notification layer needs no new plumbing: the redirect
 * IS the notification. */
const MESSAGES: Record<
  'automation' | 'instagram' | 'admin',
  Record<string, { tone: ToastTone; message: string }>
> = {
  admin: {
    'role-granted': { tone: 'success', message: 'Administrator access granted.' },
    'role-revoked': { tone: 'success', message: 'Administrator access revoked.' },
    'org-created': { tone: 'success', message: 'Organization created and access granted.' },
    'access-granted': { tone: 'success', message: 'Access granted.' },
    'access-revoked': { tone: 'success', message: 'Access revoked.' },
    // Overridden by the `?message=` param when the action supplies one - apps/api's own text
    // ("You are the only administrator...", "An organization with that slug already exists")
    // tells the administrator what to do differently, which this generic fallback cannot.
    error: { tone: 'error', message: 'That change could not be applied.' },
  },
  automation: {
    created: { tone: 'success', message: 'Automation created.' },
    updated: { tone: 'success', message: 'Changes saved.' },
    deleted: { tone: 'success', message: 'Automation deleted.' },
    synced: { tone: 'success', message: 'Refreshed from Zernio.' },
    error: {
      tone: 'error',
      message: 'Could not create the automation. Check your input and try again.',
    },
    'update-error': {
      tone: 'error',
      message: 'Could not save those changes. Check your input and try again.',
    },
    'delete-error': {
      tone: 'error',
      message: 'Could not delete the automation. Please try again.',
    },
  },
  instagram: {
    connected: { tone: 'success', message: 'Instagram account connected.' },
    'already-connected': {
      tone: 'warning',
      message: 'That Instagram account was already connected - no need to authorize it again.',
    },
    error: {
      tone: 'error',
      message: 'Could not connect your Instagram account. Please try again.',
    },
  },
};

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-success-border bg-success-bg text-success',
  warning:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
  error: 'border-danger/30 bg-danger-bg text-danger',
};

const TONE_ICON: Record<ToastTone, string> = {
  success: '✓',
  warning: '!',
  error: '✕',
};

/** Renders toasts driven by the URL's status query param, then strips that param.
 *
 * Mounted once in the root layout so every page gets notifications without repeating banner
 * markup. Stripping the param matters: without it a refresh (or a back-navigation) would
 * re-announce a stale "Automation deleted." that already happened. */
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  /** The `namespace:status:detail` already announced, so re-runs of the effect below are no-ops.
   * A ref, not state: changing it must not itself trigger a render. */
  const announcedRef = useRef<string | null>(null);
  /** Monotonic toast id source - see the comment where it is incremented. */
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const automationStatus = searchParams.get('automation');
  const instagramStatus = searchParams.get('instagram');
  const adminStatus = searchParams.get('admin');
  const namespace: 'automation' | 'instagram' | 'admin' | null = automationStatus
    ? 'automation'
    : instagramStatus
      ? 'instagram'
      : adminStatus
        ? 'admin'
        : null;
  const status = automationStatus ?? instagramStatus ?? adminStatus;
  // Only ever used to replace the *text* of an entry already matched from MESSAGES above, never
  // to conjure a toast of its own. That matters: this value comes from the URL, so a crafted
  // link could otherwise put arbitrary text on screen. React escapes it on render either way.
  const detail = searchParams.get('message');

  useEffect(() => {
    if (!status || !namespace) {
      // The param is gone (either cleared below, or a normal navigation). Reset the guard so a
      // genuinely repeated action - connecting, failing, connecting again - still announces
      // itself the second time.
      announcedRef.current = null;
      return;
    }
    const entry = MESSAGES[namespace][status];
    if (!entry) return;

    // Requirement 7: the "Instagram account connected." toast used to appear twice.
    //
    // Three separate things caused that, and only a guard that makes this effect idempotent
    // fixes all three at once. React StrictMode double-invokes effects in development. The
    // `router.replace()` below is asynchronous, so the effect can re-run - `searchParams` is a
    // new object identity on every render - while the URL still carries the old param. And a
    // navigation that re-mounts this component replays it. Rather than trying to defeat each
    // path, record what has already been announced and refuse to announce it twice.
    const key = `${namespace}:${status}:${detail ?? ''}`;
    if (announcedRef.current === key) return;
    announcedRef.current = key;

    // A counter, not Date.now(): two toasts raised inside the same millisecond would otherwise
    // share an id, and React would treat them as one list item - which is its own way of losing
    // a notification.
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    setToasts((current) => [
      ...current,
      { id, tone: entry.tone, message: detail && detail.length > 0 ? detail : entry.message },
    ]);

    // Drop the status param so the toast does not fire again on refresh, keeping every other
    // param (accountId, view, sort, page) intact - those are real view state, not one-shot
    // notifications. replace(), not push(), so Back does not step through the cleanup.
    const next = new URLSearchParams(searchParams.toString());
    next.delete('automation');
    next.delete('instagram');
    next.delete('admin');
    next.delete('message');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [status, namespace, detail, searchParams, pathname, router]);

  useEffect(() => {
    const timers = toasts
      .filter((toast) => DISMISS_AFTER_MS[toast.tone] > 0)
      .map((toast) => setTimeout(() => dismiss(toast.id), DISMISS_AFTER_MS[toast.tone]));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      // aria-live so a screen reader announces new toasts; the container is always mounted in
      // the tree when toasts exist, which is what lets the live region fire.
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-lg ${TONE_CLASS[toast.tone]}`}
        >
          <span
            aria-hidden
            className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-bold"
          >
            {TONE_ICON[toast.tone]}
          </span>
          <p className="min-w-0 flex-1 break-words text-sm font-medium">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
            className="shrink-0 text-current opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
