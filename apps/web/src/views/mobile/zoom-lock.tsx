'use client';

import { useEffect } from 'react';

/** Stops pinch zoom in the mobile view on iPhone (requested 2026-09-25).
 *
 * Three layers, because no single one works everywhere:
 *  - the viewport meta tag (`maximum-scale=1, user-scalable=no`, app/layout.tsx) covers Android
 *    and iOS's zoom-on-focus for small inputs;
 *  - `touch-action: pan-x pan-y` on `html[data-view='mobile']` (globals.css) blocks pinch and
 *    double-tap zoom while keeping scrolling, from the first paint, before any JavaScript;
 *  - this component cancels Safari's proprietary `gesture*` events. iOS has ignored
 *    `user-scalable=no` since iOS 10, and these events are the one place pinch can still be
 *    stopped there.
 *
 * Rendered only when the request resolved to the mobile view, so desktop zoom is untouched. */
export function MobileZoomLock() {
  useEffect(() => {
    const prevent = (event: Event) => event.preventDefault();
    const events = ['gesturestart', 'gesturechange', 'gestureend'] as const;
    for (const name of events) {
      document.addEventListener(name, prevent, { passive: false });
    }
    return () => {
      for (const name of events) {
        document.removeEventListener(name, prevent);
      }
    };
  }, []);

  return null;
}
