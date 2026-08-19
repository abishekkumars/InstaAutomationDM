// Platform marks for the connected-accounts card.
//
// Deliberately lettermarks in each platform's own colour rather than reproductions of the
// official logos. Meta's mark in particular is a precise piece of geometry, and an approximated
// version drawn from memory would be both visibly wrong and a misuse of their brand. A clean
// lettermark carries the same "which integration is this" signal honestly.
//
// Inline SVG rather than image files: no extra network request, and `currentColor`-free explicit
// fills mean the marks stay legible in light and dark without a second asset.

/** Meta blue. Their published brand colour, used only to tint our own mark. */
const META_BLUE = '#0081FB';

/** Zernio's accent. Distinct from Meta's blue at a glance, which is the whole point of having
 * two - a user scanning the card should never have to read the label to tell them apart. */
const ZERNIO_VIOLET = '#6D3BEB';

export function MetaMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <rect width="16" height="16" rx="4" fill={META_BLUE} />
      <text
        x="8"
        y="11.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="#ffffff"
      >
        M
      </text>
    </svg>
  );
}

export function ZernioMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <rect width="16" height="16" rx="4" fill={ZERNIO_VIOLET} />
      <text
        x="8"
        y="11.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="#ffffff"
      >
        Z
      </text>
    </svg>
  );
}

/** A small connected/disconnected pill.
 *
 * Status and action are separate on purpose. Until now the Meta control was a single element
 * that both reported the state and toggled it, which meant the only way to find out what
 * "instant sync on" did was to click it and change something. */
export function StatusPill({
  connected,
  label,
  tone = 'default',
}: {
  connected: boolean;
  label: string;
  /** `warning` marks a connection that exists but has stopped working - a Meta token Meta has
   * rejected - which is neither "connected" nor "not set up" and must not read as either. */
  tone?: 'default' | 'warning';
}) {
  const className =
    tone === 'warning'
      ? 'border-danger/30 bg-danger-bg text-danger'
      : connected
        ? 'border-success-border bg-success-bg text-success'
        : 'border-border bg-muted-bg text-text-faint';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      <span aria-hidden="true">{tone === 'warning' ? '!' : connected ? '●' : '○'}</span>
      {label}
    </span>
  );
}
