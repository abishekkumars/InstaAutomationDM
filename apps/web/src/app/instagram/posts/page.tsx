import { redirect } from 'next/navigation';
import { getView } from '@/lib/device';
import { getActiveOrganizationId } from '@/lib/organization';
import { DesktopPostsView } from '@/views/desktop/posts/posts-view';
import { MobilePostsView } from '@/views/mobile/posts/posts-view';

export default async function InstagramPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const { accountId } = await searchParams;
  if (!accountId) {
    redirect('/');
  }

  // Before any view renders: this decides a redirect, which is impossible once a Suspense
  // fallback has streamed. It is one cheap API call with no Zernio fan-out.
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) {
    redirect('/');
  }

  // See docs/ADR/0010-device-specific-views.md.
  if ((await getView()) === 'mobile') {
    return <MobilePostsView organizationId={organizationId} accountId={accountId} />;
  }
  return <DesktopPostsView organizationId={organizationId} accountId={accountId} />;
}
