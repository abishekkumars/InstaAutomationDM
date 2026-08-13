/** Inline SVG icons. Deliberately not an icon library: this app needs three glyphs, and a
 * dependency for that would cost more than it saves. All use `currentColor` and 1em sizing so
 * they inherit text colour and font size from whatever wraps them. */

const BASE_PROPS = {
  width: '1.05em',
  height: '1.05em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function EyeIcon() {
  return (
    <svg {...BASE_PROPS}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg {...BASE_PROPS}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function SyncIcon() {
  return (
    <svg {...BASE_PROPS}>
      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.65-4.26" />
      <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.65 4.26" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/** Lightning bolt, marking a post that already has a comment automation. Chosen over a gear or a
 * robot because it reads as "this fires automatically" at badge size, where finer detail is
 * illegible. */
export function BoltIcon() {
  return (
    <svg {...BASE_PROPS} fill="currentColor" strokeWidth={0}>
      <path d="M13 2 4.5 13.2c-.4.5 0 1.3.7 1.3H10l-1.2 7.2c-.1.7.8 1.1 1.2.5L19.5 10.8c.4-.5 0-1.3-.7-1.3H14l1.2-7C15.3 1.8 14.4 1.4 13 2Z" />
    </svg>
  );
}

/** Three-line hamburger, mobile nav only. Slightly larger than BASE_PROPS' 1.05em because it is
 * a standalone tap target rather than an inline glyph next to text. */
export function MenuIcon() {
  return (
    <svg {...BASE_PROPS} width="1.25em" height="1.25em" strokeWidth={2}>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...BASE_PROPS}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
