'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setAutomationActiveAction } from '@/app/automation-actions';

/** Pause / Resume on the mobile post detail (Phase 18.4). Same server action as the listing's
 * switch: a partial PATCH of `isActive`, the organization derived server-side. The label flips
 * at once; on failure it flips back with a message. On success the page is refreshed so the
 * server-rendered status pill catches up. */
export function PauseResumeButton({
  automationId,
  isActive,
}: {
  automationId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(isActive);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !optimistic;
    setError(false);
    setOptimistic(next);
    startTransition(async () => {
      // A request that never completes (offline, server restarting) rejects rather than returning
      // `{ ok: false }` - treated the same, or the switch would stay flipped with no message.
      const result = await setAutomationActiveAction(automationId, next).catch(() => ({
        ok: false,
      }));
      if (!result.ok) {
        setOptimistic(!next);
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="h-[50px] min-w-[110px] rounded-2xl border border-border bg-surface-2 px-4 text-[15px] font-bold text-text disabled:opacity-60"
      >
        {optimistic ? 'Pause' : 'Resume'}
      </button>
      {error && (
        <p role="alert" className="text-center text-xs text-danger">
          Could not save. Try again.
        </p>
      )}
    </div>
  );
}
