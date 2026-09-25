import { redirect } from 'next/navigation';
import { getView } from '@/lib/device';
import { getActiveOrganizationId } from '@/lib/organization';
import { DesktopPostDetailView } from '@/views/desktop/post-detail/post-detail-view';
import { MobilePostDetailView } from '@/views/mobile/post-detail/post-detail-view';

export default async function InstagramPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  // `automation` is still present in the URL but read by ToastHost, not here. view/sort/size/
  // page are the posts list's own view state, carried through so "Back to posts" restores it.
  searchParams: Promise<{
    accountId?: string;
    view?: string;
    sort?: string;
    size?: string;
    page?: string;
  }>;
}) {
  const { postId } = await params;
  const { accountId, view, sort, size, page } = await searchParams;
  if (!accountId) {
    redirect('/');
  }

  // Rebuilt rather than forwarded verbatim so only the known list params come back - an
  // arbitrary query string from the incoming URL is not echoed into an outgoing link.
  const backParams = new URLSearchParams({ accountId });
  if (view) backParams.set('view', view);
  if (sort) backParams.set('sort', sort);
  if (size) backParams.set('size', size);
  if (page) backParams.set('page', page);

  const organizationId = await getActiveOrganizationId();
  if (!organizationId) {
    redirect('/');
  }

  // See docs/ADR/0010-device-specific-views.md.
  const View = (await getView()) === 'mobile' ? MobilePostDetailView : DesktopPostDetailView;
  return (
    <View
      organizationId={organizationId}
      accountId={accountId}
      postId={postId}
      backQuery={backParams.toString()}
    />
  );
}
