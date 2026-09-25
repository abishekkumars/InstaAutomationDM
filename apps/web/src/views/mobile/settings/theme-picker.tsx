'use client';

import { useEffect, useState } from 'react';
import {
  applyTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from '@/views/shared/theme-toggle';

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2m-7.1-17.1 1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    ),
  },
  { value: 'dark', label: 'Dark', icon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" /> },
  {
    value: 'system',
    label: 'System',
    icon: (
      <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01" />
    ),
  },
];

/** Light / Dark / System for the mobile Settings page. Same storage key and the same applyTheme
 * as the desktop's ThemeToggle, so a choice made in either view is the choice in both - and the
 * <head> ThemeScript applies it before first paint on the next load either way. */
export function ThemePicker() {
  // Server-rendered unselected, then corrected after mount - reading localStorage during render
  // would disagree with the server HTML and trip a hydration mismatch (same as ThemeToggle).
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  function select(next: Theme) {
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
      role="group"
      aria-label="Color theme"
      className="grid grid-cols-3 gap-2 rounded-[22px] border border-border bg-surface p-2 shadow-card"
    >
      {OPTIONS.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => select(option.value)}
            className={`flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] text-[13px] font-bold ${
              selected
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface-2 text-text'
            }`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {option.icon}
            </svg>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
