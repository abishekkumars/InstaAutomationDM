'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { VIEW_OVERRIDE_COOKIE } from '@/lib/device';

/** "Use desktop site" (mobile Settings) and "Use mobile site" (the desktop sidebar, shown only on
 * a phone that switched away) - Phase 18.5, docs/ADR/0010-device-specific-views.md.
 *
 * `desktop` pins the desktop view with a cookie; `auto` deletes it, so the user agent decides
 * again. There is deliberately no way to pin `mobile` on a real desktop browser: the mobile
 * layout is drawn for a phone-sized screen. Anything else is ignored rather than trusted. A
 * preference only - it changes which layout renders, never what data a request may see.
 *
 * Always lands on `/`: the current page may not exist in the other view (`/dashboard` and
 * `/settings` are mobile-only). */
export async function setViewPreferenceAction(formData: FormData): Promise<void> {
  const preference = formData.get('view');
  const cookieStore = await cookies();

  if (preference === 'desktop') {
    cookieStore.set(VIEW_OVERRIDE_COOKIE, 'desktop', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  } else if (preference === 'auto') {
    cookieStore.delete(VIEW_OVERRIDE_COOKIE);
  }

  redirect('/');
}
