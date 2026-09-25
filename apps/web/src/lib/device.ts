import { cookies, headers } from 'next/headers';
import { userAgentFromString } from 'next/server';

/** Which view tree a request is rendered with - see docs/ADR/0010-device-specific-views.md. */
export type ViewKind = 'desktop' | 'mobile';

/** Cookie that overrides user-agent detection, set by the "Use desktop site" switch (Phase 18.5).
 * Holds exactly `desktop` or `mobile`; any other value is ignored rather than trusted. */
export const VIEW_OVERRIDE_COOKIE = 'view';

/** Pure decision, kept separate from the request plumbing so it is trivially testable.
 *
 * Only phones get the mobile view. Tablets, consoles, TVs and desktop browsers (for which the
 * user-agent parser reports no device type at all) get desktop: the mobile design is laid out for
 * a ~390px-wide screen, and a tablet has room for the sidebar layout. */
export function resolveView(
  deviceType: string | undefined,
  override: string | undefined,
): ViewKind {
  if (override === 'desktop' || override === 'mobile') {
    return override;
  }
  return deviceType === 'mobile' ? 'mobile' : 'desktop';
}

export interface ViewInfo {
  view: ViewKind;
  /** Whether the user agent is a phone - i.e. whether the mobile view is on offer at all. The
   * desktop shell uses it to show "Use mobile site" only to a phone that switched away. */
  isPhone: boolean;
}

/** The view for the current request, plus whether the device is a phone. Server-only: it reads
 * request headers and cookies, which every signed-in page already does through auth(), so this
 * adds no new dynamic rendering. */
export async function getViewInfo(): Promise<ViewInfo> {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()]);
  const { device } = userAgentFromString(headerList.get('user-agent') ?? undefined);
  return {
    view: resolveView(device.type, cookieStore.get(VIEW_OVERRIDE_COOKIE)?.value),
    isPhone: device.type === 'mobile',
  };
}

export async function getView(): Promise<ViewKind> {
  return (await getViewInfo()).view;
}
