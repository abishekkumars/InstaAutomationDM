/** The brand mark (the gradient chat-bubble "N" with the arrow), on a transparent background so
 * it sits on both the dark sidebar and the light/dark page surfaces.
 *
 * `/brand-mark.png` is a 256px, palette-compressed export of the brand logo (~15 KB). It is
 * served from `public/` and excluded from the auth proxy (src/proxy.ts), so the signed-out
 * sign-in page can show it too. A plain <img>, not next/image: the file is already the size it
 * is drawn at, so there is nothing for the image optimizer to do. Decorative (`alt=""`) wherever
 * the wordmark text sits next to it, which is everywhere it is used. */
export function BrandMark({ size = 26, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand-mark.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
}

/** Mark plus the "AutomationDM" wordmark. `accentClassName` colours the "DM": the dark sidebar
 * uses a lighter violet than the light page header, where the regular accent reads better. */
export function BrandLogo({
  size = 26,
  className = '',
  textClassName = 'text-[15px] font-bold',
  accentClassName = 'text-accent',
}: {
  size?: number;
  className?: string;
  textClassName?: string;
  accentClassName?: string;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <BrandMark size={size} />
      <span className={`whitespace-nowrap ${textClassName}`}>
        Automation<span className={accentClassName}>DM</span>
      </span>
    </span>
  );
}
