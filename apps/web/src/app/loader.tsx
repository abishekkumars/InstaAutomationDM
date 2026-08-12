'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link, { useLinkStatus } from 'next/link';

/** The spinner itself. Styles live in globals.css under `.loader` (they need ::before/::after
 * pseudo-elements and keyframes, which Tailwind utilities can't express). */
export function Loader() {
  return <span className="loader" role="status" aria-label="Loading" />;
}

/** Full-screen blocking overlay: gaussian-blurred backdrop with the spinner centred. Used
 * whenever the app is waiting on apps/api so the user can't interact with half-stale data. */
export function LoadingOverlay() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/30 backdrop-blur-md"
      role="alertdialog"
      aria-busy="true"
      aria-label="Loading"
    >
      <Loader />
    </div>
  );
}

/** Shows the overlay while the enclosing <form>'s server action is in flight.
 *
 * Must be rendered INSIDE the <form> it reports on - useFormStatus reads the nearest parent
 * form's pending state, and returns a permanently-false status if it is rendered as a sibling
 * of that form instead of a descendant. */
export function FormPendingOverlay() {
  const { pending } = useFormStatus();
  return pending ? <LoadingOverlay /> : null;
}

/** A <Link> that shows the loading overlay while its navigation is in flight.
 *
 * Every route in this app calls apps/api during server rendering, so "navigation pending" and
 * "API call pending" are the same event from the user's point of view. Use this instead of a
 * bare next/link for any link that moves between pages. */
export function LoadingLink({
  href,
  className,
  title,
  'aria-label': ariaLabel,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} title={title} aria-label={ariaLabel}>
      {children}
      <LinkPendingOverlay />
    </Link>
  );
}

/** Shows the overlay while a <Link> navigation is being prepared.
 *
 * Every page in this app fetches from apps/api during server rendering, so a pending
 * navigation IS a pending API call - that is the thing worth showing a spinner for. Must be
 * rendered inside the <Link> it reports on, same rule as FormPendingOverlay.
 *
 * Delayed by design: navigations that resolve quickly should not flash an overlay. Only a
 * genuinely slow one (past the threshold) is worth interrupting the page for. */
export function LinkPendingOverlay({ delayMs = 250 }: { delayMs?: number }) {
  const { pending } = useLinkStatus();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pending) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
      return;
    }
    timerRef.current = setTimeout(() => setVisible(true), delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pending, delayMs]);

  return visible ? <LoadingOverlay /> : null;
}
