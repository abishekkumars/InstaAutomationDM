/** The mobile dashboard's two charts, as plain server-rendered SVG and HTML - no chart library and
 * no client JavaScript. Colors come from the `chart-1` / `chart-2` tokens in globals.css, which
 * were validated for both themes (lightness band, chroma, colour-blind separation, contrast).
 *
 * Identity is never colour alone: the ring has a legend with counts, and every bar carries its
 * name and value as text. Values and labels use text tokens, never the series colour. On touch
 * screens there is no hover, so the numbers are printed directly instead of hidden in tooltips;
 * each mark also has an SVG <title> for pointer and assistive-technology users. */

const RADIUS = 38;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface-coloured gap between the two ring segments, in the SVG's own units. */
const SEGMENT_GAP = 3;

/** Active vs paused automations as a two-segment ring, with the share running in the middle. */
export function ActivePausedRing({ active, paused }: { active: number; paused: number }) {
  const total = active + paused;
  const activeLength = total === 0 ? 0 : (active / total) * CIRCUMFERENCE;
  const pausedLength = CIRCUMFERENCE - activeLength;
  // With only one non-empty segment there is nothing to separate, so no gap is cut.
  const gap = active > 0 && paused > 0 ? SEGMENT_GAP : 0;
  const share = total === 0 ? 0 : Math.round((active / total) * 100);

  return (
    <div className="relative h-[108px] w-[108px] shrink-0">
      <svg
        width="108"
        height="108"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${active} active and ${paused} paused automations`}
      >
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-seg" />
        {active > 0 && (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="12"
            strokeDasharray={`${Math.max(activeLength - gap, 0)} ${CIRCUMFERENCE}`}
            transform="rotate(-90 50 50)"
            className="stroke-chart-1"
          >
            <title>{`Active: ${active}`}</title>
          </circle>
        )}
        {paused > 0 && (
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="12"
            strokeDasharray={`${Math.max(pausedLength - gap, 0)} ${CIRCUMFERENCE}`}
            strokeDashoffset={-activeLength}
            transform="rotate(-90 50 50)"
            className="stroke-chart-2"
          >
            <title>{`Paused: ${paused}`}</title>
          </circle>
        )}
      </svg>
      <div
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        <span className="text-[22px] font-extrabold text-text">{share}%</span>
        <span className="text-[10.5px] font-semibold text-text-muted">running</span>
      </div>
    </div>
  );
}

/** One horizontal bar per automation, longest first, scaled to the largest value. */
export function TopAutomationBars({
  rows,
}: {
  rows: { id: string; name: string; value: number; valueLabel: string }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="truncate font-semibold text-text">{row.name}</span>
            <span className="shrink-0 font-bold text-text-muted">{row.valueLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-seg" aria-hidden="true">
            <div
              className="h-2 rounded-full bg-chart-1"
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
