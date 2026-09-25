import type { ReactNode } from 'react';
import { signOutAction } from '@/app/(auth)/actions';
import { BrandLogo } from '@/views/shared/brand-logo';
import { FormPendingOverlay, LoadingLink } from '@/views/shared/loader';
import {
  OrganizationSwitcher,
  type SwitcherOrganization,
} from '@/views/shared/organization-switcher';
import { ThemeToggle } from '@/views/shared/theme-toggle';
import { setViewPreferenceAction } from '@/app/view-actions';
import { MobileNav } from './mobile-nav';

// Extend this list only when a new route backs it; the UI redesign mockup's extra sidebar
// items (Instagram accounts, Settings) don't have pages yet, so they're not here.
const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/status', label: 'Status' },
];

// Rendered only for administrators (Phase 15.2b). Hiding it is presentation, not protection:
// /admin re-checks the role server-side, and every /api/admin/* route rejects a non-admin on
// its own regardless of what the sidebar chose to draw.
const ADMIN_NAV_ITEM = { href: '/admin', label: 'Administration' };

/** The signed-in desktop shell: sidebar, slim top bar, and the scrolling content pane. Moved out
 * of the root layout unchanged in Phase 18.1 (docs/ADR/0010-device-specific-views.md). */
export function DesktopShell({
  children,
  initial,
  userLabel,
  isAdmin,
  organizations,
  activeOrganizationId,
  offerMobileSite = false,
}: {
  children: ReactNode;
  initial: string;
  userLabel: string | null | undefined;
  isAdmin: boolean;
  organizations: SwitcherOrganization[];
  activeOrganizationId: string | null;
  /** A phone that chose "Use desktop site" (Phase 18.5) gets a way back in the top bar. */
  offerMobileSite?: boolean;
}) {
  const sidebar = (
    <SidebarContent
      initial={initial}
      userLabel={userLabel}
      isAdmin={isAdmin}
      organizations={organizations}
      activeOrganizationId={activeOrganizationId}
    />
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Desktop sidebar: md and up only. Below that the same content lives in MobileNav's
          drawer, so the two must never both be visible. */}
      <aside className="hidden shrink-0 bg-ink-950 text-white md:flex md:h-full md:w-60 md:flex-col md:gap-4 md:overflow-y-auto md:px-3.5 md:py-4">
        {sidebar}
      </aside>

      <MobileNav>{sidebar}</MobileNav>

      {/* min-h-0 is required: a flex child defaults to min-height:auto, which refuses to
          shrink below its content and would push the scrollbar back onto the page. */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Slim top bar so the theme switch has a consistent top-right home on the
            signed-in shell, which otherwise has only the sidebar and no header. Outside
            the scrolling pane below, so it stays fixed in place. */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-b border-border bg-surface px-4 py-2 sm:px-6 lg:px-8">
          {offerMobileSite && (
            <form action={setViewPreferenceAction}>
              <FormPendingOverlay />
              <input type="hidden" name="view" value="auto" />
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-[12px] font-medium text-accent hover:underline"
              >
                Use mobile site
              </button>
            </form>
          )}
          <ThemeToggle />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** The sidebar's brand/nav/user block, rendered identically by the desktop `<aside>` and the
 * mobile drawer so there is one definition of what the nav contains.
 *
 * Stays a server component: it renders `signOutAction` (a server action) and `LoadingLink`, and
 * putting it here rather than inside MobileNav keeps that out of the client bundle. It is passed
 * to MobileNav as children, which React renders on the server and streams in as already-rendered
 * markup.
 */
function SidebarContent({
  initial,
  userLabel,
  isAdmin,
  organizations,
  activeOrganizationId,
}: {
  initial: string;
  userLabel: string | null | undefined;
  isAdmin: boolean;
  organizations: SwitcherOrganization[];
  activeOrganizationId: string | null;
}) {
  const navItems = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <>
      {/* Hidden in the drawer, which has the brand in its own top bar already. */}
      <BrandLogo
        size={28}
        className="hidden md:flex md:px-1.5 md:pb-1"
        accentClassName="text-[#8f9bff]"
      />

      {/* Which organization every page is showing, and the way to change it for anyone who
          belongs to more than one. Renders nothing for a user with no membership yet (the
          awaiting-access state has nothing to switch between). */}
      {organizations.length > 0 && (
        <div className="shrink-0">
          <OrganizationSwitcher organizations={organizations} activeId={activeOrganizationId} />
        </div>
      )}

      <nav className="flex shrink-0 flex-col gap-0.5">
        {navItems.map((item) => (
          <LoadingLink
            key={item.href}
            href={item.href}
            className="relative rounded-md px-2.5 py-2 text-[13px] whitespace-nowrap text-[#c3c5e2] hover:bg-ink-800 hover:text-white md:py-1.5"
          >
            {item.label}
          </LoadingLink>
        ))}
      </nav>

      <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-white/10 pt-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#333a5c] text-[12px] font-semibold text-[#d7d9f2]">
          {initial}
        </span>
        {/* Visible in the drawer too: the old horizontal strip had no room for it, which is why
            it used to be md-only. The drawer does. */}
        <span className="min-w-0 flex-1 text-[12.5px] text-[#d7d9f2]">
          <span className="block truncate">{userLabel}</span>
        </span>
        <form action={signOutAction}>
          <FormPendingOverlay />
          <button
            type="submit"
            className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-[#9497c2] hover:text-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
