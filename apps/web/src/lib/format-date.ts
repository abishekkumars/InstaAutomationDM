// Deterministic date formatting for values rendered during SSR and then hydrated.
//
// `new Date(x).toLocaleDateString()` with no arguments is a hydration bug waiting to happen: it
// resolves both the locale AND the time zone from whatever environment it runs in. Node on the
// server and the browser on the client disagree on both, so React renders one string, hydrates
// another, and throws "server rendered text didn't match the client" - which then regenerates
// the whole subtree on the client. The observed mismatch on the posts list was a server
// "19/08/2026" against a client "19/8/2026": same order, different zero-padding, because the two
// ICU builds carry different locale data.
//
// Both the locale and the time zone are therefore pinned explicitly below. Pinning only the
// locale would still leave a real mismatch: a post published at 23:30 UTC falls on a different
// calendar day for a viewer east of it, so the server and client would legitimately disagree
// about the date itself, not merely its formatting.
//
// UTC is the honest choice here rather than a compromise: these are Instagram publish timestamps
// compared against each other ("is this the reel I posted this morning?"), and Instagram's own
// API reports them in UTC.

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "18 Aug 2026". Returns null for a missing or unparseable value, so callers render nothing
 * rather than the string "Invalid Date". */
export function formatDate(value: string | null | undefined): string | null {
  const date = toDate(value);
  return date ? DATE_FORMAT.format(date) : null;
}

/** "18 Aug 2026, 14:31 UTC". The zone is spelled out because a bare time that is silently not
 * the reader's own would be misread as local. */
export function formatDateTime(value: string | null | undefined): string | null {
  const date = toDate(value);
  return date ? `${DATE_TIME_FORMAT.format(date)} UTC` : null;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
