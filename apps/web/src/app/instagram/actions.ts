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
  } catch {
    redirect('/?instagram=error');
  }

  // Zernio hosts the entire OAuth flow (docs/ZERNIO-INTEGRATION.md) - this is a real
  // redirect to an external origin, not a route within this app.
  redirect(authUrl);
}
