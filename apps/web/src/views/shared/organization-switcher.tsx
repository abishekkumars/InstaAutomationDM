'use client';

import { useEffect, useRef, useState } from 'react';
import { switchOrganizationAction } from '@/app/organization-actions';
import { FormPendingOverlay } from '@/views/shared/loader';

export interface SwitcherOrganization {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

const ROLE_LABELS: Record<SwitcherOrganization['role'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

const TONES = {
  // The desktop sidebar (and the narrow-window drawer), which is always dark.
  dark: {
    box: 'border-white/10 bg-ink-850 text-white',
    trigger: 'hover:bg-ink-800',
    muted: 'text-[#9497c2]',
    avatar: 'bg-[#333a5c] text-[#d7d9f2]',
    menu: 'border-white/10 bg-ink-850 text-white',
    option: 'hover:bg-ink-800',
    active: 'bg-ink-800',
  },
  // A normal page surface - for the mobile Settings page and header - following the theme.
  light: {
    box: 'border-border bg-surface text-text',
    trigger: 'hover:bg-surface-2',
    muted: 'text-text-muted',
    avatar: 'bg-accent-soft text-accent',
    menu: 'border-border bg-surface text-text',
    option: 'hover:bg-surface-2',
    active: 'bg-accent-soft',
  },
} as const;

/** Shows which organization the app is displaying and, when the user belongs to more than one,
 * lets them switch (a dropdown of their memberships).
 *
 * Shared by both view trees (docs/ADR/0010-device-specific-views.md): the desktop sidebar renders
 * it with `tone="dark"`, the mobile tree with `tone="light"`. It is sized to its container and the
 * menu opens below it at the same width, so it works equally in a 240px sidebar and a phone-width
 * page.
 *
 * Each option is its own tiny form posting to `switchOrganizationAction`, which re-checks the id
 * against the caller's memberships before writing the `org` cookie. Nothing here is trusted: the
 * list only decides what to *offer*.
 *
 * `returnTo` is where the switch lands (see the action for why it cannot stay on the current
 * page); the mobile tree passes `/dashboard` or `/settings`.
 */
export function OrganizationSwitcher({
  organizations,
  activeId,
  tone = 'dark',
  returnTo = '/',
}: {
  organizations: SwitcherOrganization[];
  activeId: string | null;
  tone?: keyof typeof TONES;
  returnTo?: '/' | '/dashboard' | '/settings';
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const styles = TONES[tone];

  const active = organizations.find((organization) => organization.id === activeId) ?? null;
  const canSwitch = organizations.length > 1;

  // Outside click and Escape both dismiss, matching the navigation drawer. Bound only while open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!active) {
    return null;
  }

  const summary = (
    <>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold ${styles.avatar}`}
        aria-hidden="true"
      >
        {active.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] font-semibold">{active.name}</span>
        <span className={`block text-[11px] ${styles.muted}`}>{ROLE_LABELS[active.role]}</span>
      </span>
    </>
  );

  if (!canSwitch) {
    return (
      <div
        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 ${styles.box}`}
        aria-label={`Organization: ${active.name}`}
      >
        {summary}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Organization: ${active.name}. Switch organization`}
        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${styles.box} ${styles.trigger}`}
      >
        {summary}
        <ChevronIcon className={`shrink-0 ${styles.muted} ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border py-1 shadow-xl ${styles.menu}`}
        >
          <p
            className={`px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide ${styles.muted}`}
          >
            Switch organization
          </p>
          <ul className="max-h-72 overflow-y-auto">
            {organizations.map((organization) => {
              const isActive = organization.id === active.id;
              return (
                <li key={organization.id}>
                  <form action={switchOrganizationAction}>
                    <FormPendingOverlay />
                    <input type="hidden" name="organizationId" value={organization.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <button
                      type="submit"
                      disabled={isActive}
                      aria-current={isActive ? 'true' : undefined}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left disabled:cursor-default ${
                        isActive ? styles.active : styles.option
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {organization.name}
                        </span>
                        <span className={`block text-[11px] ${styles.muted}`}>
                          {ROLE_LABELS[organization.role]}
                        </span>
                      </span>
                      {isActive && <CheckIcon />}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${className}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
