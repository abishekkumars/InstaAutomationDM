'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, callApi } from '@/lib/api';

// Server actions for the Administration screen (Phase 15.2b).
//
// Every one of these is a thin pass-through to an `/api/admin/*` route. None of them checks
// whether the caller is an administrator, and that is deliberate rather than an omission:
// `AdminGuard` in apps/api makes that decision on every route, from a role it reads out of the
// database. Re-checking here would add a second place to get it wrong, and would still not be
// the thing standing between a non-admin and the data - see docs/SECURITY.md.
//
// Plain `<form action={...}>` + hidden inputs, matching app/automation-actions.ts.

const ADMIN_PATH = '/admin';

/** Errors are surfaced through the same `?admin=` toast channel the successes use, with the
 * API's own message when there is one.
 *
 * apps/api returns genuinely useful messages here - "An organization with that slug already
 * exists", "You are the only administrator..." - and a generic "something went wrong" would
 * throw away the only text that tells the administrator what to do differently. The message is
 * URL-encoded into the redirect so ToastHost can render it verbatim. */
function failWith(error: unknown, fallback: string): never {
  console.error('[admin] action failed:', error);
  const message = error instanceof ApiError ? error.message : fallback;
  redirect(`${ADMIN_PATH}?admin=error&message=${encodeURIComponent(message)}`);
}

function succeedWith(status: string): never {
  revalidatePath(ADMIN_PATH);
  redirect(`${ADMIN_PATH}?admin=${status}`);
}

function requireString(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== 'string' || value.trim().length === 0) {
    redirect(`${ADMIN_PATH}?admin=error&message=${encodeURIComponent(`Missing ${field}.`)}`);
  }
  return value.trim();
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const userId = requireString(formData, 'userId');
  const role = requireString(formData, 'role');

  try {
    await callApi(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  } catch (error) {
    failWith(error, 'Could not change that role.');
  }

  succeedWith(role === 'ADMIN' ? 'role-granted' : 'role-revoked');
}

/** Creates an organization and, when `ownerUserId` is present, admits that user to it in the
 * same request - so "give this new user access" is one action rather than two that can
 * half-succeed and leave an ownerless organization behind. */
export async function createOrganizationForUserAction(formData: FormData): Promise<void> {
  const name = requireString(formData, 'name');
  const slug = requireString(formData, 'slug');
  const ownerUserId = formData.get('ownerUserId');

  try {
    await callApi('/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name,
        slug,
        ...(typeof ownerUserId === 'string' && ownerUserId.length > 0 ? { ownerUserId } : {}),
      }),
    });
  } catch (error) {
    failWith(error, 'Could not create that organization.');
  }

  succeedWith('org-created');
}

export async function addMembershipAction(formData: FormData): Promise<void> {
  const userId = requireString(formData, 'userId');
  const organizationId = requireString(formData, 'organizationId');
  const role = formData.get('role');

  try {
    await callApi(`/api/admin/users/${userId}/memberships`, {
      method: 'POST',
      body: JSON.stringify({
        organizationId,
        ...(typeof role === 'string' && role.length > 0 ? { role } : {}),
      }),
    });
  } catch (error) {
    failWith(error, 'Could not grant that access.');
  }

  succeedWith('access-granted');
}

export async function removeMembershipAction(formData: FormData): Promise<void> {
  const userId = requireString(formData, 'userId');
  const organizationId = requireString(formData, 'organizationId');

  try {
    await callApi(`/api/admin/users/${userId}/memberships/${organizationId}`, {
      method: 'DELETE',
    });
  } catch (error) {
    failWith(error, 'Could not revoke that access.');
  }

  succeedWith('access-revoked');
}
