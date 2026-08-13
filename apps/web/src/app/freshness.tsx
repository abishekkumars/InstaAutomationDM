'use client';

import { useEffect, useState } from 'react';

/** Renders how old the dashboard's Zernio-backed numbers are, next to the Sync button.
 *
 * The dashboard's automation rows are served from the data cache, so the figures on screen can be
 * up to a minute old (longer while a stale entry revalidates in the background). Without this the
 * cache is invisible and a user who just changed something in Zernio's own dashboard has no way to
 * tell whether they are looking at a stale snapshot or a real result.
 *
 * Two deliberate choices about how the time is handled:
 *
 *  - **An age, not a wall-clock time.** The plan called for "as of HH:MM", but this renders on a
 *    Vercel function running in UTC, so an absolute time would be formatted in the server's
 *    timezone, not the reader's. An elapsed duration is timezone-free, and with a 60s TTL it is
 *    also the more informative of the two.
 *  - **Ticking measured from mount, not from the server's timestamp.** The initial value comes
 *    from the server as a prop, so the first client render matches the HTML exactly and there is
 *    no hydration mismatch. Every later value adds only time elapsed in this browser, so a
 *    server/browser clock skew can never make freshly fetched data read as minutes old.
 */
export function DataAge({ initialAgeSeconds }: { initialAgeSeconds: number }) {
  const [ageSeconds, setAgeSeconds] = useState(initialAgeSeconds);

  useEffect(() => {
    // performance.now() rather than Date.now(): monotonic, so the label cannot jump backwards if
    // the machine's clock is adjusted while the page is open.
    const mountedAt = performance.now();
    const timer = setInterval(() => {
      setAgeSeconds(initialAgeSeconds + Math.round((performance.now() - mountedAt) / 1000));
    }, 15_000);
    return () => clearInterval(timer);
  }, [initialAgeSeconds]);

  return (
    <span
      className="hidden text-xs text-text-faint sm:inline"
      title="Stats and thumbnails are cached briefly. Press Sync to refetch from Zernio now."
    >
      Updated {formatAge(ageSeconds)}
    </span>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 45) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
}
