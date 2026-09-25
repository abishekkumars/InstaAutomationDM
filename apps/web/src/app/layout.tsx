import type { Metadata, Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import { isCurrentUserAdmin } from '@/lib/me';
import { getActiveOrganization, type ActiveOrganization } from '@/lib/organization';
import { getViewInfo } from '@/lib/device';
import { getSession } from '@/lib/session';
import { DesktopShell } from '@/views/desktop/shell';
import { MobileShell } from '@/views/mobile/shell';
import { BrandLogo } from '@/views/shared/brand-logo';
import { MobileZoomLock } from '@/views/mobile/zoom-lock';
import { SessionExpiryWatcher } from '@/views/shared/session-expiry-watcher';
import { ThemeScript, ThemeToggle } from '@/views/shared/theme-toggle';
import { ToastHost } from '@/views/shared/toast';
import './globals.css';

// The favicon and the iOS home-screen icon come from the `app/icon.png` and `app/apple-icon.png`
// file conventions, and the Android/PWA install icons from `app/manifest.ts` - Next emits the
// <link> tags for all three itself. All are cut from the brand logo; see public/icons.
export const metadata: Metadata = {
  title: 'AutomationDM',
  applicationName: 'AutomationDM',
  description: 'Instagram DM automation for creators and businesses.',
  appleWebApp: { title: 'AutomationDM', capable: true, statusBarStyle: 'default' },
};

/** Per device, so the mobile view can lock zoom while desktop keeps it (requested 2026-09-25).
 * Reads the user agent, which the layout already does on every request (lib/device.ts), so this
 * makes nothing dynamic that was not already. */
export async function generateViewport(): Promise<Viewport> {
  const { view } = await getViewInfo();
  return {
    width: 'device-width',
    initialScale: 1,
    // The mobile view is laid out for a phone screen at 1x and does not zoom. This stops pinch
    // zoom on Android and the automatic zoom iOS applies when a small input is focused. iOS
    // ignores `userScalable` for pinch, so MobileZoomLock and the `data-view` CSS rule in
    // globals.css cover that.
    ...(view === 'mobile' ? { maximumScale: 1, userScalable: false } : {}),
    // Tints the mobile browser's address bar to match the page canvas in each theme.
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: '#f5f5fb' },
      { media: '(prefers-color-scheme: dark)', color: '#0e1220' },
    ],
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Read up front: both the signed-out and signed-in documents lock zoom in the mobile view.
  const [session, { view, isPhone }] = await Promise.all([getSession(), getViewInfo()]);

  if (!session?.user) {
    return (
      <html lang="en" data-view={view} suppressHydrationWarning>
        <head>
          <ThemeScript />
        </head>
        {/* Signed-out shell. `min-h-dvh` for the same reason the signed-in shell uses `h-dvh`:
            `100vh` overshoots the visible area on mobile browsers, which here shows up as a
            page that scrolls slightly for no reason. */}
        <body className="min-h-dvh bg-canvas text-text antialiased">
          <div className="flex min-h-dvh flex-col">
            <header className="border-b border-border bg-surface">
              <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                <BrandLogo size={30} textClassName="text-lg font-semibold" />
                <ThemeToggle />
              </div>
            </header>
            <main className="flex flex-1 items-center justify-center px-4 py-10">
              <div className="w-full max-w-sm">{children}</div>
            </main>
          </div>
          {/* Also mounted here, not just on the signed-in shell: no signed-out flow redirects
              with a status param today, but omitting it would make the first one that does fail
              silently. */}
          <Suspense fallback={null}>
            <ToastHost />
          </Suspense>
          {view === 'mobile' && <MobileZoomLock />}
        </body>
      </html>
    );
  }

  const initial = (session.user.name ?? session.user.email ?? '?').charAt(0).toUpperCase();
  // Never throws - degrades to "not an admin" if apps/api is unreachable, so an API outage
  // costs a nav item rather than every signed-in page. See lib/me.ts.
  const isAdmin = await isCurrentUserAdmin();
  // Feeds the organization switcher. Same rule as the admin check above: the layout renders on
  // every signed-in page, so an unreachable apps/api must cost the switcher, not the whole app.
  // Pages that need the organization make (and report failure of) the same memoized call.
  const organizationState: ActiveOrganization = await getActiveOrganization().catch(
    (error: unknown) => {
      console.error('[organizations] could not load memberships for the switcher:', error);
      return { organizations: [], active: null };
    },
  );

  return (
    <html lang="en" data-view={view} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      {/* Fixed-height shell with scrolling delegated to the content pane below: the sidebar and
          top bar stay put while only the page content moves. Previously the whole document
          scrolled, which carried the sidebar off-screen.

          `h-dvh`, not `h-screen` (Phase 16.3, requirement 15). `h-screen` is `100vh`, which on
          mobile browsers means the *large* viewport - the height the page would have if the URL
          bar were hidden. Combined with `overflow-hidden` here, that made the shell taller than
          the visible area, and since this element is the one that clips, the overflow was
          unreachable: the top bar sat under the URL bar and the bottom of the content was cut
          off with nothing able to scroll to it. `100dvh` tracks the viewport as the browser
          chrome shows and hides, so the shell is always exactly what is actually visible.

          `min-h-0` on the flex column below is what lets the inner pane shrink and scroll rather
          than pushing past this height. */}
      <body className="h-dvh overflow-hidden bg-canvas text-text antialiased">
        {/* Phones get the mobile shell (glass bottom tab bar), everything else the desktop sidebar
            shell - see lib/device.ts and docs/ADR/0010-device-specific-views.md. */}
        {view === 'mobile' ? (
          <MobileShell activeOrganizationId={organizationState.active?.id ?? null}>
            {children}
          </MobileShell>
        ) : (
          <DesktopShell
            initial={initial}
            userLabel={session.user.name ?? session.user.email}
            isAdmin={isAdmin}
            organizations={organizationState.organizations}
            activeOrganizationId={organizationState.active?.id ?? null}
            offerMobileSite={isPhone}
          >
            {children}
          </DesktopShell>
        )}
        {/* Signed-in shell only: on the sign-in page there is no session to expire, and polling
            for one there would be noise. */}
        <SessionExpiryWatcher />
        {/* Suspense boundary is required: ToastHost reads useSearchParams(), which opts its
            subtree into client-side rendering and would otherwise force the whole layout to
            bail out of static rendering. */}
        <Suspense fallback={null}>
          <ToastHost />
        </Suspense>
        {view === 'mobile' && <MobileZoomLock />}
      </body>
    </html>
  );
}
