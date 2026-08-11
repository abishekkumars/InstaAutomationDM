'use server';

import { redirect } from 'next/navigation';
import { callApi } from '@/lib/api';

// Plain <form action={...}> + hidden inputs for organizationId/accountId/postId, matching
// the FormData-reading style already used by app/instagram/actions.ts. `keywords` is a
// single comma-separated text field, not per-keyword inputs - this app has no client-side
// interactive form components yet (every form so far is a plain server action), and a
// comma-separated field is the simplest way to accept multiple keywords without introducing
// one. Split into the array Zernio's own API (and this project's createAutomationSchema)
// expects before sending.
export async function createAutomationAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  const accountId = formData.get('accountId');
  const postId = formData.get('postId');
  if (
    typeof organizationId !== 'string' ||
    typeof accountId !== 'string' ||
    typeof postId !== 'string'
  ) {
    redirect('/');
  }

  const keywordsRaw = formData.get('keywords');
  const keywords =
    typeof keywordsRaw === 'string'
      ? keywordsRaw
          .split(',')
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 0)
      : [];
  const commentReply = formData.get('commentReply');

  try {
    await callApi(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts/${postId}/automations`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          keywords,
          matchMode: formData.get('matchMode'),
          commentReply:
            typeof commentReply === 'string' && commentReply.length > 0 ? commentReply : undefined,
          dmMessage: formData.get('dmMessage'),
        }),
      },
    );
  } catch (error) {
    // Same reasoning as app/instagram/actions.ts's connectInstagramAction - surface the real
    // cause server-side instead of leaving only a generic error banner to debug from.
    console.error('[automations] create failed:', error);
    redirect(`/instagram/posts/${postId}?accountId=${accountId}&automation=error`);
  }

  redirect(`/instagram/posts/${postId}?accountId=${accountId}&automation=created`);
}
