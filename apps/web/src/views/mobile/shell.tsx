import type { ReactNode } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { getInstagramAccounts } from '@/app/dashboard-data';
import { MobileTabBar } from './tab-bar';

// The mobile design's typeface. Loaded through next/font, which self-hosts it at build time (no
// request to Google from the browser) and applies it only where this class is used - the mobile
// tree - so the desktop view's typography is unchanged.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap' });

/** The signed-in mobile shell (Phase 18.2, docs/ADR/0010-device-specific-views.md): one scrolling
 * content area with the glass tab bar docked over its bottom edge.
 *
 * The root layout's `<body>` is already a fixed `h-dvh overflow-hidden` box, so this fills it and
 * delegates scrolling to the inner area - the same arrangement as the desktop shell, which is
 * what lets the tab bar stay put while content scrolls underneath its frosted glass. The bottom
 * padding keeps the last card clear of the bar (72px bar + the + button's overhang + the home-
 * indicator inset).
 *
 * The organization switcher is not in the shell: on mobile it lives on the Settings page (Phase
 * 18.5). */
export async function MobileShell({
  children,
  activeOrganizationId,
}: {
  children: ReactNode;
  activeOrganizationId: string | null;
}) {
  // The + button opens the posts grid, which is per Instagram account. The first connected
  // account of the active organization is the only sensible default (the app has one per
  // organization in practice). Never fatal: an unreachable apps/api costs the shortcut, and the
  // page itself reports the outage.
  let postsHref = '/';
  if (activeOrganizationId) {
    const accounts = await getInstagramAccounts(activeOrganizationId).catch(() => []);
    const first = accounts[0];
    if (first) {
      postsHref = `/instagram/posts?accountId=${encodeURIComponent(first.id)}`;
    }
  }

  // `scroll-pt` matches the top padding: on navigation Next scrolls the new page's first element
  // into view, and without a matching scroll padding it lands flush against the screen edge with
  // the padding scrolled away (seen on the post detail's Back button).
  return (
    <div className={`${jakarta.className} relative h-full`}>
      <div className="h-full scroll-pt-[calc(1.5rem+env(safe-area-inset-top))] overflow-y-auto overscroll-contain px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(8rem+env(safe-area-inset-bottom))] [scrollbar-width:none]">
        {children}
      </div>
      <MobileTabBar postsHref={postsHref} />
    </div>
  );
}
