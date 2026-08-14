import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { callApi } from '@/lib/api';
import { invalidateOrganizationCaches } from '@/lib/revalidate';

// Where Zernio redirects the browser back to after the user completes Instagram's OAuth consent
// screen (docs/ZERNIO-INTEGRATION.md's "Account connection" section). This route sits behind
// proxy.ts's normal authenticated-session requirement like every other page, so the caller here is
// still the same logged-in user who started the connect flow - not a public, unauthenticated
// webhook-style endpoint.
//
// A Route Handler rather than the page this used to be (Phase 16.1, requirement 8). It renders
// nothing and always redirects, and it now has to invalidate the dashboard's cached reads so the
// newly connected account is visible immediately - and `revalidateTag` throws if called during a
// Server Component render. A route handler is the supported place for it.
export async function GET(request: NextRequest): Promise<never> {
  const params = request.nextUrl.searchParams;
  const organizationId = params.get('organizationId');
  const connected = params.get('connected');
  const profileId = params.get('profileId');
  const accountId = params.get('accountId');

  if (!organizationId || connected !== 'instagram' || !profileId || !accountId) {
    redirect('/?instagram=error');
  }

  try {
    await callApi(`/api/organizations/${organizationId}/instagram/callback`, {
      method: 'POST',
      body: JSON.stringify({ profileId, accountId }),
    });
  } catch (error) {
    // Same reasoning as instagram/actions.ts's connect action - surface the real cause
    // server-side instead of leaving only a generic error banner to debug from.
    console.error('[instagram] callback confirmation failed:', error);
    redirect('/?instagram=error');
  }

  // Requirement 8: sync automatically instead of leaving the user to press Sync themselves.
  //
  // The dashboard's reads are cached for 60s by tag (ADR 0006), so without this a user who has
  // just connected an account lands on a dashboard rendered from a cache entry written *before*
  // the account existed - it shows the "Connect Instagram" call to action again, which reads as
  // the connection having failed. That is the same confusion requirement 6 is about, arriving by
  // a different route.
  invalidateOrganizationCaches(organizationId, '/');

  redirect('/?instagram=connected');
}
