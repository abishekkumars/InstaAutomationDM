'use client';

/** A switch. Extracted because the create wizard, the edit dialog, and the dashboard all need
 * the same control, and three hand-rolled copies had already started to drift apart in size
 * and knob offset. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  /** Accessible name - the visible text sits next to the switch, not inside it. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      // Requirement 14: the switch was easy to miss when off. `bg-muted-bg` sitting on
      // `bg-surface` is a very small step in luminance, so an unchecked toggle read as empty
      // space - the control was there, but the eye slid past it.
      //
      // The fix is an outline that is always present, in both states, rather than a brighter
      // "off" fill: a border defines the control's shape even when its fill nearly matches the
      // card behind it, and keeping it in the checked state too means the switch does not change
      // size or position as it flips. `border-strong` (not `border`) because this has to survive
      // being the only thing separating two similar greys.
      className={`relative h-5 w-9 shrink-0 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40 ${
        checked ? 'border-accent bg-accent' : 'border-border-strong bg-muted-bg'
      }`}
    >
      <span
        // The knob carries a border and a shadow for the same reason: when off it is
        // `bg-surface` on `bg-muted-bg`, which is another low-contrast pairing. Sized 3.5 rather
        // than 4 to sit inside the new 1px border without touching it.
        className={`absolute top-[1px] h-3.5 w-3.5 rounded-full shadow-sm transition-all ${
          checked
            ? 'left-[18px] bg-accent-ink'
            : 'left-[1px] border border-border-strong bg-surface'
        }`}
      />
    </button>
  );
}
