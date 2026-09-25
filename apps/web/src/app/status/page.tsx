import { getView } from '@/lib/device';
import { getSession } from '@/lib/session';
import { DesktopStatusView } from '@/views/desktop/status/status-view';
import { MobileStatusView } from '@/views/mobile/status/status-view';

// See docs/ADR/0010-device-specific-views.md. `/status` is public: signed out, a phone still gets
// the mobile layout, with the API check alone (there is no organization to report on).
export default async function StatusPage() {
  const [view, session] = await Promise.all([getView(), getSession()]);
  if (view === 'mobile') {
    return <MobileStatusView signedIn={Boolean(session?.user)} />;
  }
  return <DesktopStatusView />;
}
