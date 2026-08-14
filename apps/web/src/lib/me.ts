import { cache } from 'react';
import type { GlobalUserRole } from '@automationdm/shared';
import { callApi } from './api';

export interface CurrentUser {
  id: string;
  email: string;
  role: GlobalUserRole;
}

/** The caller's identity as `apps/api` resolved it, including their global role.
 *
 * Asked of `apps/api` rather than read from the Auth.js session on purpose: the session
 * deliberately does not carry the role (see docs/SECURITY.md's "Global user roles"), so that
 * there is exactly one authority for it and revoking admin takes effect immediately.
 *
 * Memoized per request, so the root layout and the Administration page share one call.
 */
export const getCurrentUser = cache(() => callApi<CurrentUser>('/api/me'));

/** As `getCurrentUser`, but never throws - it answers "is this caller an admin?" with `false`
 * when it cannot find out.
 *
 * This exists for the root layout, which renders on *every* signed-in page. An unreachable
 * `apps/api` there would otherwise throw during the layout render and take down every route at
 * once, including the ones that do not need the API at all. Degrading to "not an admin" hides a
 * nav item, which is recoverable and obvious; throwing bricks the app.
 *
 * Safe to fail this way precisely because hiding the item is not what protects anything -
 * `AdminGuard` rejects a non-admin on every `/api/admin/*` route regardless of what was
 * rendered.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    return (await getCurrentUser()).role === 'ADMIN';
  } catch (error) {
    console.error('[admin] could not resolve the current user, assuming not an admin:', error);
    return false;
  }
}
