import { revalidatePath, revalidateTag } from 'next/cache';
import { automationTags } from './cache-tags';

/** Expires every cached read a change to an organization's Instagram data can affect.
 *
 * Lives here rather than in `app/automation-actions.ts` because that file carries a `'use server'`
 * directive, which turns *every* export into a callable server action - a shared helper exported
 * from there would become a remotely-invokable endpoint, which it has no business being. This
 * module is plain code that both server actions and route handlers can import.
 *
 * `revalidateTag` (not `updateTag`) because the cached reads are built on `unstable_cache`, whose
 * own docs name `revalidateTag`/`revalidatePath` as its invalidation path. Getting this wrong
 * fails silently: the write succeeds, the page re-renders, and the user still sees old data.
 *
 * `{ expire: 0 }` rather than the `'max'` profile: `'max'` is stale-while-revalidate, which would
 * serve the pre-change values once more before refreshing. After an explicit action the user must
 * see the result immediately.
 *
 * `revalidatePath` as well as the tags: the tags clear the data cache, the path clears the cached
 * render that would otherwise be replayed without re-running those fetches.
 *
 * Note this may only be called from a Server Action or a Route Handler. Calling it during a
 * Server Component render throws - which is why the Instagram callback is a route handler
 * (`app/instagram/callback/route.ts`) rather than the page it used to be.
 */
export function invalidateOrganizationCaches(organizationId: string, path: string): void {
  for (const tag of automationTags(organizationId)) {
    revalidateTag(tag, { expire: 0 });
  }
  revalidatePath(path);
}
