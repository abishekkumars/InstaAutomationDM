'use client';

import { useFormStatus } from 'react-dom';
import { syncAutomationsAction } from './automation-actions';
import { SyncIcon } from './icons';

/** Refetches the dashboard's live Zernio data (stats, thumbnails, and any automation created
 * directly in Zernio's dashboard) on demand, rather than making the user reload the page.
 *
 * Deliberately not the global FormPendingOverlay: this is a background refresh of data already
 * on screen, so blanking the page behind a full-screen spinner would be a worse experience than
 * spinning the icon in place. */
export function SyncButton({ organizationId }: { organizationId: string }) {
  return (
    <form action={syncAutomationsAction}>
      {/* The action needs the org id to build the cache tags it expires. */}
      <input type="hidden" name="organizationId" value={organizationId} />
      <SyncSubmit />
    </form>
  );
}

function SyncSubmit() {
  // Must be a separate component: useFormStatus reports on the nearest PARENT form, so calling
  // it in SyncButton itself (where the form is a child, not an ancestor) would always be false.
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title="Refetch stats and automations from Zernio"
      className="flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-60"
    >
      <span className={pending ? 'animate-spin' : undefined}>
        <SyncIcon />
      </span>
      {pending ? 'Syncing…' : 'Sync'}
    </button>
  );
}
