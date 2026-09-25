'use client';

import { useEffect, useRef, useState } from 'react';
import { signOutAction } from '@/app/(auth)/actions';
import { FormPendingOverlay } from '@/views/shared/loader';

function LogoutIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

/** Sign out, behind a confirmation sheet (Phase 18.5) - on a phone the button sits where a stray
 * thumb lands, and signing out means typing the password again. Posts to the same
 * `signOutAction` as the desktop sidebar.
 *
 * Escape and the Cancel button close it. The backdrop is a real button, so tapping outside also
 * cancels - there is nothing typed to lose here. */
export function SignOutSheet() {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 items-center justify-center gap-2.5 rounded-[20px] border border-border bg-surface text-[15.5px] font-extrabold text-danger shadow-card"
      >
        <LogoutIcon size={20} />
        Sign out
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            aria-label="Cancel sign out"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink-950/45"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-out-title"
            className="relative flex flex-col items-center gap-2.5 rounded-[30px] border border-glass-border bg-glass px-[18px] pt-[22px] pb-[18px] text-center shadow-glass backdrop-blur-2xl backdrop-saturate-[1.8]"
          >
            <span className="mb-1.5 h-[5px] w-10 rounded-full bg-switch-off" aria-hidden="true" />
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-bg text-danger">
              <LogoutIcon size={24} />
            </span>
            <h2 id="sign-out-title" className="text-lg font-extrabold text-text">
              Sign out of AutomationDM?
            </h2>
            <p className="max-w-[280px] text-sm leading-5 text-text-muted">
              Your automations keep running. You will need to sign in again to manage them.
            </p>
            <form action={signOutAction} className="mt-2 w-full">
              <FormPendingOverlay />
              <button
                type="submit"
                className="h-[52px] w-full rounded-2xl bg-danger text-[15px] font-extrabold text-danger-ink"
              >
                Sign out
              </button>
            </form>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setOpen(false)}
              className="h-[52px] w-full rounded-2xl border border-border bg-surface text-[15px] font-bold text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
