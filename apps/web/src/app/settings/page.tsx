import { redirect } from 'next/navigation';
import { getView } from '@/lib/device';
import { MobileSettingsView } from '@/views/mobile/settings/settings-view';

export const metadata = { title: 'Settings - AutomationDM' };

// Mobile only (docs/ADR/0010-device-specific-views.md). The desktop keeps these controls where
// they already are - the theme switch in the top bar, the organization switcher and Sign out in
// the sidebar - so a desktop visit here goes to the dashboard.
export default async function SettingsPage() {
  if ((await getView()) !== 'mobile') {
    redirect('/');
  }
  return <MobileSettingsView />;
}
