import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { auth } from '@/auth';
import { signOutAction } from './(auth)/actions';
import { FormPendingOverlay, LoadingLink } from './loader';
import { ThemeScript, ThemeToggle } from './theme-toggle';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutomationDM',
  description: 'Instagram DM automation for creators and businesses.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Two nav items because two routes actually exist behind sign-in - / (dashboard) and /status.
// Extend this list only when a new route backs it; the UI redesign mockup's extra sidebar
// items (Instagram accounts, Settings) don't have pages yet, so they're not here.
const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/status', label: 'Status' },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head>
          <ThemeScript />
        </head>
        <body className="min-h-screen bg-canvas text-text antialiased">
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-border bg-surface">
              <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                <span className="text-lg font-semibold">
                  Automation<span className="text-accent">DM</span>
                </span>
                <ThemeToggle />
              </div>
            </header>
            <main className="flex flex-1 items-center justify-center px-4 py-10">
              <div className="w-full max-w-sm">{children}</div>
            </main>
          </div>
        </body>
      </html>
    );
  }

  const initial = (session.user.name ?? session.user.email ?? '?').charAt(0).toUpperCase();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      {/* h-screen + overflow-hidden on the shell, with scrolling delegated to the content
          pane below: the sidebar and top bar stay put while only the page content moves.
          Previously the whole document scrolled, which carried the sidebar off-screen. */}
      <body className="h-screen overflow-hidden bg-canvas text-text antialiased">
        <div className="flex h-full flex-col md:flex-row">
          <aside className="flex shrink-0 items-center gap-3 overflow-x-auto bg-ink-950 px-4 py-3 text-white md:h-full md:w-60 md:flex-col md:items-stretch md:gap-4 md:overflow-x-visible md:overflow-y-auto md:px-3.5 md:py-4">
            <div className="flex shrink-0 items-center gap-2 md:px-1.5 md:pb-1">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-gradient-to-br from-[#5b6dff] to-accent text-[13px] font-bold">
                A
              </span>
              <span className="text-[15px] font-bold whitespace-nowrap">
                Automation<span className="text-[#8f9bff]">DM</span>
              </span>
            </div>

            <nav className="flex shrink-0 gap-1.5 md:flex-col md:gap-0.5">
              {NAV_ITEMS.map((item) => (
                <LoadingLink
                  key={item.href}
                  href={item.href}
                  className="relative rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap text-[#c3c5e2] hover:bg-ink-800 hover:text-white md:px-2.5"
                >
                  {item.label}
                </LoadingLink>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2 md:mt-auto md:border-t md:border-white/10 md:pt-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#333a5c] text-[12px] font-semibold text-[#d7d9f2]">
                {initial}
              </span>
              <span className="hidden min-w-0 flex-1 text-[12.5px] text-[#d7d9f2] md:block">
                <span className="block truncate">{session.user.name ?? session.user.email}</span>
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
          </aside>

          {/* min-h-0 is required: a flex child defaults to min-height:auto, which refuses to
              shrink below its content and would push the scrollbar back onto the page. */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Slim top bar so the theme switch has a consistent top-right home on the
                signed-in shell, which otherwise has only the sidebar and no header. Outside
                the scrolling pane below, so it stays fixed in place. */}
            <div className="flex shrink-0 justify-end border-b border-border bg-surface px-4 py-2 sm:px-6 lg:px-8">
              <ThemeToggle />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
