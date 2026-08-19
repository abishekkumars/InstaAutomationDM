'use server';

import { redirect } from 'next/navigation';
import { callApi } from '@/lib/api';
import { invalidateOrganizationCaches } from '@/lib/revalidate';

// Plain <form action={...}> + a hidden input for organizationId (not .bind()) - matches the
// FormData-reading style already used by app/(auth)/actions.ts and app/admin/actions.ts in this
// codebase.
export async function connectInstagramAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    redirect('/?instagram=error');
  }

  type ConnectResult =
    | { alreadyConnected: false; authUrl: string }
    | { alreadyConnected: true; account: { username: string | null } };

  let result: ConnectResult;
  try {
    result = await callApi<ConnectResult>(
      `/api/organizations/${organizationId}/instagram/connect`,
      { method: 'POST' },
    );
  } catch (error) {
    // Without this, a failed connect attempt (apps/api unreachable, Zernio rejecting the
    // API key, the caller no longer being a member) is a dead end: the UI only ever shows
    // a generic "?instagram=error" banner, with nothing in either app's logs to say why -
    // this is what actually made a real Phase 8 connect failure look like a silent no-op.
    console.error('[instagram] connect failed:', error);
    redirect('/?instagram=error');
  }

  // apps/api found this organization's Zernio profile already had an Instagram account
  // connected and reconciled it into our own database - there is nothing to authorize, so
  // skip the OAuth round trip entirely rather than sending the user through a flow that
  // would only re-connect what they already have.
  if (result.alreadyConnected) {
    // Requirement 8 explicitly covers this branch too ("as well as already connected
    // connection"). apps/api has just written or updated an `instagram_accounts` row during
    // reconciliation, so the dashboard's cached reads are stale in exactly the same way as
    // after a fresh connect - and this is the path most likely to look broken without it,
    // since the user pressed a button and would otherwise see no change at all.
    invalidateOrganizationCaches(organizationId, '/');
    redirect('/?instagram=already-connected');
  }

  // Zernio hosts the entire OAuth flow (docs/ZERNIO-INTEGRATION.md) - this is a real
  // redirect to an external origin, not a route within this app.
  redirect(result.authUrl);
}

/** Starts the *direct Meta* connection for one already-Zernio-connected account (Phase 17).
 *
 * This is a second, separate OAuth flow, and deliberately so: Zernio runs the automations,
 * while Meta is what makes a just-published reel listable immediately instead of hours later.
 * See docs/ADR/0009-direct-meta-graph-api-for-post-listing.md. */
export async function connectMetaAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  const accountId = formData.get('accountId');
  if (typeof organizationId !== 'string' || !organizationId) {
    redirect('/?meta=error');
  }
  if (typeof accountId !== 'string' || !accountId) {
    redirect('/?meta=error');
  }

  let result: { authUrl: string };
  try {
    result = await callApi<{ authUrl: string }>(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/meta/connect`,
      { method: 'POST' },
    );
  } catch (error) {
    // Same reasoning as the Zernio connect action above: without this, a Meta app that is not
    // configured (or a caller who lost membership) is a dead end with nothing in the logs.
    console.error('[meta] connect failed:', error);
    redirect('/?meta=error');
  }

  redirect(result.authUrl);
}

/** Removes the Meta connection. Listing falls back to Zernio; automations are untouched, since
 * they live in Zernio regardless. */
export async function disconnectMetaAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  const accountId = formData.get('accountId');
  if (typeof organizationId !== 'string' || !organizationId) {
    redirect('/?meta=error');
  }
  if (typeof accountId !== 'string' || !accountId) {
    redirect('/?meta=error');
  }

  try {
    await callApi(`/api/organizations/${organizationId}/instagram/accounts/${accountId}/meta`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('[meta] disconnect failed:', error);
    // A distinct status from the connect failure above. Sharing the bare "error" value made a
    // failed DISCONNECT announce "Could not connect Meta", pointing the user at the opposite
    // action from the one that had just failed.
    redirect('/?meta=disconnect-error');
  }

  invalidateOrganizationCaches(organizationId, '/');
  redirect('/?meta=disconnected');
}
