'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RefreshIcon } from '../icons';

/** "Check now": re-renders the status page on the server, which re-runs every health check. */
export function RefreshStatusButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="flex h-[46px] items-center justify-center gap-2 rounded-[14px] border border-border bg-surface-2 text-sm font-bold text-text disabled:opacity-60"
    >
      <RefreshIcon size={17} className={pending ? 'animate-spin' : undefined} />
      {pending ? 'Checking…' : 'Check now'}
    </button>
  );
}
