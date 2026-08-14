'use server';

import { redirect } from 'next/navigation';
import { callApi } from '@/lib/api';
// Shared with the Instagram connect flow (lib/revalidate.ts) so "what a change invalidates" has
// one definition - a route handler needs the same behaviour and cannot import it from a
// 'use server' module.
import { invalidateOrganizationCaches } from '@/lib/revalidate';

// Edit/delete actions, shared by the post detail page and the dashboard table. They live here
// rather than under instagram/posts/[postId]/ because the dashboard has no post in its route -
// both callers identify the automation by its own id, which is all the API's PATCH/DELETE
// routes need.
//
// `redirectTo` is passed by the caller instead of being derived here: the same action serves
// two pages, and after a delete the user should land back on the page they were already on.

function parseButtons(formData: FormData): { title: string; url: string }[] {
  // Same positional pairing as createAutomationAction: each row renders two same-named inputs,
  // and getAll() preserves DOM order.
  const titles = formData.getAll('buttonTitle').map(String);
  const urls = formData.getAll('buttonUrl').map(String);
  return titles
    .map((title, index) => ({ title: title.trim(), url: (urls[index] ?? '').trim() }))
    .filter((button) => button.title.length > 0 && button.url.length > 0);
}

export async function updateAutomationAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  const automationId = formData.get('automationId');
  const redirectTo = formData.get('redirectTo');
  if (typeof organizationId !== 'string' || typeof automationId !== 'string') {
    redirect('/');
  }
  const target = typeof redirectTo === 'string' && redirectTo.length > 0 ? redirectTo : '/';

  const keywordsRaw = formData.get('keywords');
  const keywords =
    typeof keywordsRaw === 'string'
      ? keywordsRaw
          .split(',')
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 0)
      : [];
  const commentReply = formData.get('commentReply');
  const commentReplyVariations = formData
    .getAll('commentReplyVariation')
    .map((reply) => String(reply).trim())
    .filter((reply) => reply.length > 0);

  try {
    await callApi(`/api/organizations/${organizationId}/automations/${automationId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: formData.get('name'),
        // Always sent, including as [] - that is how an automation is switched to triggering on
        // any comment (Phase 16.2, requirement 12), not an omission.
        keywords,
        matchMode: formData.get('matchMode'),
        audience: formData.get('audience') ?? 'any',
        // Always sent, including as [] - that is how alternates are cleared, same convention as
        // `buttons` below.
        commentReplyVariations,
        // Always sent, including as '' - that is how the public reply gets cleared. Omitting
        // the key would instead leave whatever is already stored on the automation.
        commentReply: typeof commentReply === 'string' ? commentReply : '',
        // Always sent, including as [] - Zernio's documented way to remove every button.
        buttons: parseButtons(formData),
        dmMessage: formData.get('dmMessage'),
        isActive: formData.get('isActive') !== 'false',
      }),
    });
  } catch (error) {
    console.error('[automations] update failed:', error);
    redirect(`${target}${target.includes('?') ? '&' : '?'}automation=update-error`);
  }

  invalidateOrganizationCaches(organizationId, target);
  redirect(`${target}${target.includes('?') ? '&' : '?'}automation=updated`);
}

/** Refetches the dashboard from Zernio.
 *
 * apps/api's list endpoint reads live from Zernio (stats, thumbnails, and any automation created
 * directly in Zernio's own dashboard get reconciled server-side), so "sync" is exactly a cache
 * invalidation plus a re-render - there is no separate sync job to kick off.
 *
 * This only became meaningful once the dashboard's reads were cached. Before that every fetch was
 * `no-store`, so there was nothing to invalidate and the button's `revalidatePath` was a no-op
 * dressed up as a refresh.
 */
export async function syncAutomationsAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  if (typeof organizationId !== 'string') {
    redirect('/');
  }
  invalidateOrganizationCaches(organizationId, '/');
  redirect('/?automation=synced');
}

export async function deleteAutomationAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  const automationId = formData.get('automationId');
  const redirectTo = formData.get('redirectTo');
  if (typeof organizationId !== 'string' || typeof automationId !== 'string') {
    redirect('/');
  }
  const target = typeof redirectTo === 'string' && redirectTo.length > 0 ? redirectTo : '/';

  try {
    await callApi(`/api/organizations/${organizationId}/automations/${automationId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('[automations] delete failed:', error);
    redirect(`${target}${target.includes('?') ? '&' : '?'}automation=delete-error`);
  }

  invalidateOrganizationCaches(organizationId, target);
  redirect(`${target}${target.includes('?') ? '&' : '?'}automation=deleted`);
}
