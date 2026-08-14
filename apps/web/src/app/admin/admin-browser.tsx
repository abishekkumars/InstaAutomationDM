'use client';

import { useState } from 'react';
import { FormPendingOverlay } from '../loader';
import { TrashIcon } from '../icons';
import {
  addMembershipAction,
  createOrganizationForUserAction,
  removeMembershipAction,
  setUserRoleAction,
} from './actions';
import type { AdminOrganizationSummary, AdminUserSummary } from './admin-data';

/** The Administration table (Phase 15.2b).
 *
 * A client component only because each row can expand an inline "grant access" form; every
 * mutation is still a plain `<form action={serverAction}>`, so nothing here holds state that
 * matters, and the page works the same whether or not the expansion state survives.
 */
export function AdminBrowser({
  users,
  organizations,
  currentUserId,
}: {
  users: AdminUserSummary[];
  organizations: AdminOrganizationSummary[];
  /** Used only to label the caller's own row and to soften the wording when they are about to
   * demote themselves. The rule that actually prevents a lockout lives in apps/api. */
  currentUserId: string;
}) {
  const adminCount = users.filter((user) => user.role === 'ADMIN').length;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-text">Users</h2>
          <span className="text-xs text-text-faint">
            {users.length} {users.length === 1 ? 'user' : 'users'} &middot; {adminCount}{' '}
            {adminCount === 1 ? 'administrator' : 'administrators'}
          </span>
        </header>

        <ul className="divide-y divide-border">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              organizations={organizations}
              isSelf={user.id === currentUserId}
              isLastAdmin={user.role === 'ADMIN' && adminCount === 1}
            />
          ))}
        </ul>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-text">Organizations</h2>
        </header>
        {organizations.length === 0 ? (
          <p className="px-4 py-4 text-sm text-text-muted">
            No organizations yet. Create one from a user&apos;s row above.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {organizations.map((organization) => (
              <li
                key={organization.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-text">{organization.name}</span>
                <span className="text-xs text-text-faint">
                  <code className="rounded bg-muted-bg px-1.5 py-0.5">{organization.slug}</code>
                  {' · '}
                  {organization.memberCount} {organization.memberCount === 1 ? 'member' : 'members'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UserRow({
  user,
  organizations,
  isSelf,
  isLastAdmin,
}: {
  user: AdminUserSummary;
  organizations: AdminOrganizationSummary[];
  isSelf: boolean;
  isLastAdmin: boolean;
}) {
  const [granting, setGranting] = useState(false);
  const hasAccess = user.organizations.length > 0;

  // The organizations this user is not already in - the only ones worth offering in the picker.
  const joinable = organizations.filter(
    (organization) =>
      !user.organizations.some((membership) => membership.organizationId === organization.id),
  );

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
            <span className="break-all">{user.email}</span>
            {user.role === 'ADMIN' && (
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                Admin
              </span>
            )}
            {isSelf && <span className="text-[11px] text-text-faint">(you)</span>}
          </p>

          {hasAccess ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {user.organizations.map((membership) => (
                <span
                  key={membership.organizationId}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted-bg px-2.5 py-1 text-xs font-medium text-text"
                >
                  {membership.name}
                  <span className="text-text-faint">{membership.role.toLowerCase()}</span>
                  <form action={removeMembershipAction} className="inline">
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="organizationId" value={membership.organizationId} />
                    <button
                      type="submit"
                      aria-label={`Revoke ${user.email} access to ${membership.name}`}
                      title="Revoke access"
                      className="flex text-text-faint hover:text-danger"
                    >
                      <TrashIcon />
                    </button>
                  </form>
                </span>
              ))}
            </div>
          ) : (
            // The state requirement 16 is about: until an administrator admits them, this user
            // reaches nothing at all.
            <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              No access yet &mdash; not a member of any organization.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setGranting(!granting)}
            className="rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text"
          >
            {granting ? 'Cancel' : 'Grant access'}
          </button>

          <form action={setUserRoleAction}>
            <FormPendingOverlay />
            <input type="hidden" name="userId" value={user.id} />
            <input
              type="hidden"
              name="role"
              value={user.role === 'ADMIN' ? 'NORMAL_USER' : 'ADMIN'}
            />
            <button
              type="submit"
              // Disabled purely as a courtesy - apps/api refuses this with a 409 regardless, and
              // that refusal is what actually prevents the lockout. Disabling here just stops
              // the administrator making a request that was always going to fail.
              disabled={isLastAdmin}
              title={
                isLastAdmin
                  ? 'This is the only administrator. Grant the role to someone else first.'
                  : undefined
              }
              className="rounded-md border border-border-strong px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              {user.role === 'ADMIN' ? 'Revoke admin' : 'Make admin'}
            </button>
          </form>
        </div>
      </div>

      {granting && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface-2 p-3">
          <form action={createOrganizationForUserAction} className="space-y-2">
            <FormPendingOverlay />
            <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
              Create a new organization
            </p>
            <input type="hidden" name="ownerUserId" value={user.id} />
            <div className="flex flex-wrap gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Organization name</span>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={user.email.split('@')[0]}
                  placeholder="Organization name"
                  className="block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                />
              </label>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Slug</span>
                {/* Prefilled with the server-derived suggestion (requirement 5): the email's
                    local part, already stepped past any slug in use. Editable - the
                    administrator has the final say - and re-checked by apps/api on submit,
                    which is where a collision is actually caught. */}
                <input
                  type="text"
                  name="slug"
                  required
                  defaultValue={user.suggestedSlug}
                  placeholder="slug"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  title="Lowercase letters, numbers and hyphens only."
                  className="block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 font-mono text-sm text-text"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
              >
                Create &amp; grant
              </button>
            </div>
          </form>

          {joinable.length > 0 && (
            <form
              action={addMembershipAction}
              className="flex flex-wrap gap-2 border-t border-border pt-3"
            >
              <FormPendingOverlay />
              <input type="hidden" name="userId" value={user.id} />
              <p className="w-full text-xs font-semibold uppercase tracking-wide text-text-faint">
                Or add to an existing one
              </p>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Organization</span>
                <select
                  name="organizationId"
                  required
                  className="block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                >
                  {joinable.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name} ({organization.slug})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Role in the organization</span>
                <select
                  name="role"
                  defaultValue="MEMBER"
                  className="block rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                  <option value="OWNER">Owner</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text"
              >
                Add
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
