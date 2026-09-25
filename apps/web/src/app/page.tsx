import { getView } from '@/lib/device';
import { DesktopDashboardView } from '@/views/desktop/dashboard/dashboard-view';
import { MobileListingView } from '@/views/mobile/listing/listing-view';

// Routes own params, redirects and the choice of view; the presentation lives in src/views
// (docs/ADR/0010-device-specific-views.md). On a phone `/` is the Listing tab; its stats and
// charts move to `/dashboard` (Phase 18.3).
export default async function HomePage() {
  if ((await getView()) === 'mobile') {
    return <MobileListingView />;
  }
  return <DesktopDashboardView />;
}
