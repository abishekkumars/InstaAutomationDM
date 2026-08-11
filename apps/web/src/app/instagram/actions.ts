'use server';

import { redirect } from 'next/navigation';
import { callApi } from '@/lib/api';

// Plain <form action={...}> + a hidden input for organizationId (not .bind()) - matches the
// FormData-reading style already used by app/(auth)/actions.ts and
// app/onboarding/actions.ts in this codebase.
export async function connectInstagramAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    redirect('/?instagram=error');
  }

  let authUrl: string;
  try {
    const result = await callApi<{ authUrl: string }>(
      `/api/organizations/${organizationId}/instagram/connect`,
      { method: 'POST' },
    );
    authUrl = result.authUrl;
  } catch (error) {
    // Without this, a failed connect attempt (apps/api unreachable, Zernio rejecting the
    // API key, the caller no longer being a member) is a dead end: the UI only ever shows
    // a generic "?instagram=error" banner, with nothing in either app's logs to say why -
    // this is what actually made a real Phase 8 connect failure look like a silent no-op.
    console.error('[instagram] connect failed:', error);
    redirect('/?instagram=error');
  }

  // Zernio hosts the entire OAuth flow (docs/ZERNIO-INTEGRATION.md) - this is a real
  // redirect to an external origin, not a route within this app.
  redirect(authUrl);
}
