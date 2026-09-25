'use client';

/** The mobile design's larger switch (50x30, against the desktop Toggle's 36x20): a touch
 * target that is comfortable with a thumb. Same semantics as views/shared/toggle.tsx - a
 * `role="switch"` button whose accessible name is supplied by the caller. */
export function MobileSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
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
      className={`flex h-[30px] w-[50px] shrink-0 rounded-full p-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60 ${
        checked ? 'justify-end bg-accent' : 'justify-start bg-switch-off'
      }`}
    >
      <span className="block h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]" />
    </button>
  );
}
