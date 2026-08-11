'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'automationdm-theme';

/** Runs before first paint (see ThemeScript below) AND on every later change, so the two can
 * never disagree about what a given stored value means. "system" deliberately removes the
 * attribute rather than resolving it to light/dark, which lets the CSS media query stay the
 * source of truth and keeps the theme following the OS if the user changes it later. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage can throw in private-browsing / blocked-cookie modes - fall through to
    // the default rather than taking the whole page down over a theme preference.
  }
  return 'system';
}

/** Inlined into <head> so the stored theme is applied before the browser paints anything.
 * Without this the page renders with the server-side default and then snaps to the user's
 * real choice - the classic dark-mode "flash". Deliberately not a React effect: effects run
 * after paint, which is exactly too late. */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

const OPTIONS: { value: Theme; label: string; title: string }[] = [
  { value: 'light', label: 'Light', title: 'Light' },
  { value: 'system', label: 'Auto', title: 'Match system setting' },
  { value: 'dark', label: 'Dark', title: 'Dark' },
];

export function ThemeToggle() {
  // Always start at the server-rendered default. Reading localStorage during render would
  // make the first client render disagree with the server's HTML and trip a hydration
  // mismatch, so the real value is picked up in the effect below instead.
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  function selectTheme(next: Theme): void {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this page view, it just won't persist.
    }
  }

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
      role="group"
      aria-label="Color theme"
    >
      {OPTIONS.map((option) => {
        // Before mount every button renders unselected, so the server HTML and the first
        // client render match regardless of what's in localStorage.
        const selected = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={selected}
            onClick={() => selectTheme(option.value)}
            className={
              selected
                ? 'rounded-md bg-accent px-2 py-1 text-[12px] font-medium text-accent-ink'
                : 'rounded-md px-2 py-1 text-[12px] font-medium text-text-muted hover:bg-muted-bg hover:text-text'
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
