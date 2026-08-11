import { redirect } from 'next/navigation';
import { callApi } from '@/lib/api';

interface CallbackSearchParams {
  organizationId?: string;
  connected?: string;
  profileId?: string;
  accountId?: string;
}

// Where Zernio redirects the browser back to after the user completes Instagram's OAuth
// consent screen (docs/ZERNIO-INTEGRATION.md's "Account connection" section). This route sits
// behind proxy.ts's normal authenticated-session requirement like every other page, so the
// caller here is still the same logged-in user who started the connect flow - not a public,
// unauthenticated webhook-style endpoint.
export default async function InstagramCallbackPage({
  searchParams,
}: {
  searchParams: Promise<CallbackSearchParams>;
}) {
  const { organizationId, connected, profileId, accountId } = await searchParams;

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

  redirect('/?instagram=connected');
}
