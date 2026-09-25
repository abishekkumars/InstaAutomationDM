import { redirect } from 'next/navigation';
import { getView } from '@/lib/device';
import { getActiveOrganization } from '@/lib/organization';
import { DesktopTemplatesView } from '@/views/desktop/templates/templates-view';
import { MobileTemplatesView } from '@/views/mobile/templates/templates-view';

export const metadata = { title: 'Templates - AutomationDM' };

// Automation templates (Phase 19), in both view trees - see docs/ADR/0010-device-specific-views.md.
// Templates belong to the active organization. A user with no membership yet has nothing to
// template, so they go to `/`, which shows the awaiting-access state.
export default async function TemplatesPage() {
  const [view, { active }] = await Promise.all([getView(), getActiveOrganization()]);
  if (!active) {
    redirect('/');
  }
  const View = view === 'mobile' ? MobileTemplatesView : DesktopTemplatesView;
  return <View organizationId={active.id} organizationName={active.name} />;
}
