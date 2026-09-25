import { redirect } from 'next/navigation';
import { getView } from '@/lib/device';
import { MobileDashboardView } from '@/views/mobile/dashboard/dashboard-view';

export const metadata = { title: 'Dashboard - AutomationDM' };

// Mobile only (docs/ADR/0010-device-specific-views.md). On a phone the stats and charts live on
// their own tab; the desktop dashboard at `/` already shows them above the automations table, so
// a desktop visit here (a shared link, a phone switched to the desktop site) just goes there.
export default async function DashboardPage() {
  if ((await getView()) !== 'mobile') {
    redirect('/');
  }
  return <MobileDashboardView />;
}
