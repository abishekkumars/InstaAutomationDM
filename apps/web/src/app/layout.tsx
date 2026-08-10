import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { auth } from '@/auth';
import { signOutAction } from './(auth)/actions';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutomationDM',
  description: 'Instagram DM automation for creators and businesses.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
              <span className="text-lg font-semibold">AutomationDM</span>
              <nav className="flex items-center gap-4 text-sm text-slate-600">
                <a href="/" className="hover:text-slate-900">
                  Dashboard
                </a>
                <a href="/status" className="hover:text-slate-900">
                  Status
                </a>
                {session?.user ? (
                  <form action={signOutAction} className="flex items-center gap-3">
                    <span className="text-slate-500">{session.user.email}</span>
                    <button type="submit" className="font-medium text-slate-900 hover:underline">
                      Sign out
                    </button>
                  </form>
                ) : (
                  <a href="/sign-in" className="font-medium text-slate-900 hover:underline">
                    Sign in
                  </a>
                )}
              </nav>
            </div>
          </header>
          <main className="flex-1">
            <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
          </main>
          <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
            AutomationDM — Phase 5 application shell
          </footer>
        </div>
      </body>
    </html>
  );
}
