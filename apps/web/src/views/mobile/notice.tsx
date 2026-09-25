import type { ReactNode } from 'react';

/** A full-width message card for the mobile tree's non-content states: API unreachable, awaiting
 * access, and the like. */
export function MobileNotice({
  title,
  tone = 'default',
  children,
}: {
  title: string;
  tone?: 'default' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'warning' ? 'alert' : undefined}
      className={`mt-6 rounded-[24px] border p-5 ${
        tone === 'warning' ? 'border-warn/30 bg-warn-bg text-warn' : 'border-border bg-surface'
      }`}
    >
      <p className={`text-[17px] font-extrabold ${tone === 'warning' ? '' : 'text-text'}`}>
        {title}
      </p>
      <p className={`mt-1.5 text-sm leading-5 ${tone === 'warning' ? '' : 'text-text-muted'}`}>
        {children}
      </p>
    </div>
  );
}
