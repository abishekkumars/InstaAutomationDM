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
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${
        checked ? 'bg-accent' : 'bg-muted-bg'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
          checked ? 'left-4 bg-accent-ink' : 'left-0.5 bg-surface'
        }`}
      />
    </button>
  );
}
