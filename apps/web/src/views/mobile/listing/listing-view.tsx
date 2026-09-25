import { Suspense } from 'react';
import { ApiError } from '@/lib/api';
import { getActiveOrganization } from '@/lib/organization';
import { getAutomationsWithMeta, getInstagramAccounts } from '@/app/dashboard-data';
import { connectInstagramAction } from '@/app/instagram/actions';
import { FormPendingOverlay } from '@/views/shared/loader';
import { InstagramIcon } from '../icons';
import { MobileNotice } from '../notice';
import { MobileAutomationList } from './automation-list';

/** The mobile Listing tab (Phase 18.2): every automation of the active organization as a card,
 * with search, All/Active/Paused filters and an enable switch per card.
 *
 * Mirrors the desktop dashboard's states - API unreachable, awaiting access, nothing connected -
 * and the same memoized fetchers, so the numbers match the desktop view exactly. */
export async function MobileListingView() {
  let organizationState;
  try {
    organizationState = await getActiveOrganization();
  } catch (error) {
    return (
      <MobileNotice tone="warning" title="Could not load your organization">
        {error instanceof ApiError ? error.message : 'API not reachable.'}
      </MobileNotice>
    );
  }

  const organization = organizationState.active;
  if (!organization) {
    return (
      <MobileNotice title="Waiting for access">
        Your account is set up, but it has not been added to an organization yet. An administrator
        needs to grant you access before you can connect an Instagram account or create automations.
      </MobileNotice>
    );
  }

  return (
    <Suspense fallback={<ListingSkeleton />}>
      <ListingSection organizationId={organization.id} />
    </Suspense>
  );
}

async function ListingSection({ organizationId }: { organizationId: string }) {
  const [accounts, automations] = await Promise.all([
    getInstagramAccounts(organizationId),
    getAutomationsWithMeta(organizationId),
  ]);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[30px] leading-[38px] font-extrabold tracking-[-0.02em] text-text">
          Automations
        </h1>
        <div className="flex flex-col items-center gap-3 rounded-[24px] border border-border bg-surface p-6 text-center shadow-card">
          <span className="flex h-13 w-13 items-center justify-center rounded-[18px] bg-accent-2-soft text-accent-2">
            <InstagramIcon size={24} />
          </span>
          <p className="text-[17px] font-extrabold text-text">Connect Instagram</p>
          <p className="text-sm text-text-muted">
            Connect a Business or Creator Instagram account to start creating automations.
          </p>
          <form action={connectInstagramAction} className="w-full">
            <FormPendingOverlay />
            <input type="hidden" name="organizationId" value={organizationId} />
            <button
              type="submit"
              className="mt-1 h-[52px] w-full rounded-2xl bg-accent text-[15px] font-bold text-accent-ink"
            >
              Connect Instagram
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Same derivation as the desktop freshness label: both timestamps from the server's clock, so
  // only a plain number of seconds crosses to the browser.
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - Date.parse(automations.fetchedAt)) / 1000),
  );
  const handles = accounts.map((account) => `@${account.username ?? account.zernioAccountId}`);

  return (
    <MobileAutomationList
      organizationId={organizationId}
      automations={automations.data}
      accountLabel={handles.join(', ')}
      ageSeconds={ageSeconds}
    />
  );
}

function ListingSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-24 rounded bg-seg" />
      <div className="h-9 w-48 rounded-lg bg-seg" />
      <div className="h-12 rounded-2xl bg-seg" />
      <div className="flex gap-2">
        <div className="h-[38px] w-16 rounded-full bg-seg" />
        <div className="h-[38px] w-20 rounded-full bg-seg" />
        <div className="h-[38px] w-20 rounded-full bg-seg" />
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="h-[84px] rounded-[22px] bg-seg" />
      ))}
    </div>
  );
}
