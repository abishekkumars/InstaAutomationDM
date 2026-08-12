'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { callApi } from '@/lib/api';
import { automationTags } from '@/lib/cache-tags';

// Edit/delete actions, shared by the post detail page and the dashboard table. They live here
// rather than under instagram/posts/[postId]/ because the dashboard has no post in its route -
// both callers identify the automation by its own id, which is all the API's PATCH/DELETE
// routes need.
//
// `redirectTo` is passed by the caller instead of being derived here: the same action serves
// two pages, and after a delete the user should land back on the page they were already on.

/** Expires every cached read a change to an automation can affect.
 *
 * `revalidateTag` (not `updateTag`) because the cached reads are built on `unstable_cache`, whose
 * own docs name `revalidateTag`/`revalidatePath` as its invalidation path - `updateTag` is
 * documented for `fetch`-tagged and `'use cache'` entries, which these are not. Getting this wrong
 * fails silently: the write succeeds, the page re-renders, and the user still sees old numbers.
 *
 * `{ expire: 0 }` rather than the recommended `'max'` profile: `'max'` is stale-while-revalidate,
 * which would serve the pre-edit values once more before refreshing. After an explicit save or a
 * Sync press the user must see their own change immediately, so this expires now and lets the next
 * request wait for fresh data.
 *
 * `revalidatePath` as well as the tags: the tags clear the data cache, the path clears the cached
 * render that would otherwise be replayed without re-running these fetches.
 */
function invalidateAutomationCaches(organizationId: string, path: string): void {
  for (const tag of automationTags(organizationId)) {
    revalidateTag(tag, { expire: 0 });
  }
  revalidatePath(path);
}

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

  try {
    await callApi(`/api/organizations/${organizationId}/automations/${automationId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: formData.get('name'),
        keywords,
        matchMode: formData.get('matchMode'),
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

  invalidateAutomationCaches(organizationId, target);
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
  invalidateAutomationCaches(organizationId, '/');
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

  invalidateAutomationCaches(organizationId, target);
  redirect(`${target}${target.includes('?') ? '&' : '?'}automation=deleted`);
}
