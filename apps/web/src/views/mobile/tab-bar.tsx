'use client';

import { usePathname } from 'next/navigation';
import { LoadingLink } from '@/views/shared/loader';
import { DashboardIcon, ListIcon, PlusIcon, PulseIcon, SettingsIcon } from './icons';

type TabKey = 'listing' | 'dashboard' | 'posts' | 'status' | 'settings';

function activeTab(pathname: string): TabKey | null {
  if (pathname === '/') return 'listing';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/instagram/posts')) return 'posts';
  if (pathname.startsWith('/status')) return 'status';
  if (pathname.startsWith('/settings')) return 'settings';
  return null;
}

/** The frosted-glass bottom navigation from the approved mobile design: Listing, Dashboard, the
 * raised + (the posts grid, where a new automation starts), Status and Settings.
 *
 * Docked flush to the bottom edge (the design review asked for no floating gap), with the home-
 * indicator inset added underneath on phones that have one. A client component only for
 * `usePathname`; every item is an ordinary link, so it works before hydration too.
 *
 * `postsHref` comes from the server: the posts grid needs an `accountId`, and only the shell
 * knows the active organization's connected accounts. Without one it points at `/`, where the
 * listing shows the connect-Instagram prompt instead. */
export function MobileTabBar({ postsHref }: { postsHref: string }) {
  const current = activeTab(usePathname());

  return (
    <nav
      aria-label="Main"
      className="absolute inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center rounded-t-[28px] border-t border-glass-border bg-glass px-2 pt-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-glass backdrop-blur-2xl backdrop-saturate-[1.8]"
    >
      <Tab href="/" label="Listing" active={current === 'listing'}>
        <ListIcon />
      </Tab>
      <Tab href="/dashboard" label="Dashboard" active={current === 'dashboard'}>
        <DashboardIcon />
      </Tab>
      <div className="flex justify-center">
        <LoadingLink
          href={postsHref}
          aria-label="New automation: view posts"
          aria-current={current === 'posts' ? 'page' : undefined}
          className={`-mt-8 flex h-[60px] w-[60px] items-center justify-center rounded-[22px] bg-accent text-accent-ink shadow-fab transition-transform ${
            current === 'posts' ? 'scale-105' : ''
          }`}
        >
          <PlusIcon size={28} strokeWidth={2.4} />
        </LoadingLink>
      </div>
      <Tab href="/status" label="Status" active={current === 'status'}>
        <PulseIcon />
      </Tab>
      <Tab href="/settings" label="Settings" active={current === 'settings'}>
        <SettingsIcon />
      </Tab>
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <LoadingLink
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex h-[62px] flex-col items-center justify-center gap-[3px] ${
        active ? 'text-accent' : 'text-text-muted'
      }`}
    >
      <span
        className={`flex h-[30px] w-[46px] items-center justify-center rounded-xl transition-colors ${
          active ? 'bg-accent-soft' : ''
        }`}
      >
        {children}
      </span>
      <span className="text-[10.5px] font-bold">{label}</span>
    </LoadingLink>
  );
}
