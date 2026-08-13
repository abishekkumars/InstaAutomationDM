'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MenuIcon } from './icons';

/** Mobile-only slide-in nav drawer.
 *
 * Below `md` the sidebar used to render as a horizontal scrolling strip pinned above the page
 * content, which cost vertical space and pushed the user/sign-out controls off to the side. This
 * replaces that with a hamburger button and an off-canvas drawer holding the same sidebar
 * content. At `md` and up this component renders nothing at all - the desktop sidebar in
 * layout.tsx is unchanged and is the only nav on wide screens.
 *
 * `children` is the sidebar markup, rendered by the server layout and passed in. That keeps the
 * client bundle to the open/close state alone: the nav links and the sign-out form (a server
 * action) stay server-rendered rather than being reimplemented for the drawer.
 */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Any navigation closes the drawer. Watching the pathname rather than adding onClick to each
  // link means this holds for every way out of the drawer - a nav link, the browser back button,
  // or a redirect from the sign-out action.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape to dismiss, matching the modals elsewhere in the app. Only bound while open so the
  // handler is not sitting on the document for the whole session.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      {/* The bar is part of the normal document flow (not fixed): the shell is h-screen with
          scrolling delegated to the content pane, so a fixed bar would overlap that pane's
          first rows instead of sitting above them. */}
      <div className="flex shrink-0 items-center gap-2 bg-ink-950 px-3 py-2.5 text-white md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          className="rounded-md p-1.5 text-[#c3c5e2] hover:bg-ink-800 hover:text-white"
        >
          <MenuIcon />
        </button>
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-gradient-to-br from-[#5b6dff] to-accent text-[13px] font-bold">
          A
        </span>
        <span className="text-[15px] font-bold whitespace-nowrap">
          Automation<span className="text-[#8f9bff]">DM</span>
        </span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop click closes: unlike the edit/create dialogs there is no in-progress input
              to lose here, so dismiss-on-outside-click is the expected behaviour. */}
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink-950/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative flex h-full w-64 max-w-[80%] flex-col gap-4 overflow-y-auto bg-ink-950 px-3.5 py-4 text-white shadow-xl"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-2 top-2 rounded-md px-2 py-1 text-[15px] text-[#9497c2] hover:text-white"
            >
              ✕
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
