'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Reads a piece of view state from the URL query string and writes it back on change.
 *
 * Used instead of useState for anything the user would expect to survive navigating away and
 * coming back - view mode, sort order, page size, page number. Plain useState resets on
 * unmount, which is why opening a post and pressing Back used to dump the list back to its
 * defaults (grid / newest / page 1).
 *
 * The URL is the store rather than sessionStorage for three reasons: Back and Forward restore
 * it for free (the browser already keeps per-entry history state), the view is shareable and
 * reloadable, and there is no hydration mismatch - the server renders from the same params the
 * client reads.
 *
 * Writes use replace(), not push(), so changing a filter does not add a history entry the user
 * has to press Back through to leave the page. scroll: false keeps the viewport still, since
 * these controls sit above a long list.
 */
export function useUrlState<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (value: T) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const raw = searchParams.get(key);
  // Validate rather than cast: these values come from a URL a user can hand-edit, and an
  // unrecognised one should fall back to the default instead of rendering a broken view.
  const value = raw !== null && isValid(raw) ? raw : fallback;

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) {
        // Keep the default out of the URL so the common case stays clean and copy-pasteable.
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [key, fallback, searchParams, pathname, router],
  );

  return [value, setValue];
}

/** Numeric variant of useUrlState, for page number and page size. */
export function useUrlNumberState(
  key: string,
  fallback: number,
  allowed?: readonly number[],
): [number, (value: number) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const raw = searchParams.get(key);
  const parsed = raw === null ? NaN : Number(raw);
  const value =
    Number.isFinite(parsed) && parsed > 0 && (!allowed || allowed.includes(parsed))
      ? parsed
      : fallback;

  const setValue = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) {
        params.delete(key);
      } else {
        params.set(key, String(next));
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [key, fallback, searchParams, pathname, router],
  );

  return [value, setValue];
}
