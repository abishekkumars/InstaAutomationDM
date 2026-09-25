import { Suspense, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { getActiveOrganization } from '@/lib/organization';
import { getAutomationsWithMeta, getInstagramAccounts, sumStats } from '@/app/dashboard-data';
import { DataAge } from '@/views/shared/freshness';
import { ClickIcon, InstagramIcon, PulseIcon, SendIcon } from '../icons';
import { MobileNotice } from '../notice';
import { MobilePageHeader } from '../page-header';
import { ActivePausedRing, TopAutomationBars } from './charts';

const numberFormat = new Intl.NumberFormat('en-US');

/** The mobile Dashboard tab (Phase 18.3): the four stat cards, active vs paused, and the top
 * automations by DMs sent - all from data that exists today, through the same memoized fetchers
 * as the desktop dashboard, so the numbers match it exactly.
 *
 * The approved design also shows per-day DM and comments-vs-DMs charts. Nothing records per-day
 * history yet (Zernio's stats are all-time totals), so those charts would have to invent data.
 * They wait for Phase 11/12's event records, and the page says so in their place - see
 * docs/ADR/0010-device-specific-views.md. */
export async function MobileDashboardView() {
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
        An administrator needs to add you to an organization before there is anything to show here.
      </MobileNotice>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <MobilePageHeader eyebrow="Overview" title="Dashboard" compactSubtitle={organization.name} />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardSections organizationId={organization.id} />
      </Suspense>
    </div>
  );
}

async function DashboardSections({ organizationId }: { organizationId: string }) {
  const [accounts, automations] = await Promise.all([
    getInstagramAccounts(organizationId),
    getAutomationsWithMeta(organizationId),
  ]);

  if (accounts.length === 0) {
    return (
      <MobileNotice title="Nothing to show yet">
        Connect an Instagram account from the Listing tab to start collecting stats.
      </MobileNotice>
    );
  }

  const rows = automations.data;
  const activeCount = rows.filter((automation) => automation.isActive).length;
  const pausedCount = rows.length - activeCount;
  const totals = sumStats(rows);
  const ageSeconds = Math.max(
    0,
    Math.round((Date.now() - Date.parse(automations.fetchedAt)) / 1000),
  );
  const ctrLabel = totals.ctr === null ? '—' : `${totals.ctr.toFixed(1)}%`;

  // Only rows Zernio actually reported stats for: a row with `stats: null` is "unknown", not zero,
  // and ranking it as zero would put a real automation at the bottom for no reason.
  const top = rows
    .filter((automation) => automation.stats !== null)
    .sort((a, b) => (b.stats?.dmsSent ?? 0) - (a.stats?.dmsSent ?? 0))
    .slice(0, 5)
    .map((automation) => ({
      id: automation.id,
      name: automation.name,
      value: automation.stats?.dmsSent ?? 0,
      valueLabel: numberFormat.format(automation.stats?.dmsSent ?? 0),
    }));

  return (
    <div className="flex flex-col gap-4">
      <DataAge initialAgeSeconds={ageSeconds} className="text-xs font-semibold text-text-muted" />

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<PulseIcon size={19} />}
          tone="accent"
          label="Active automations"
          value={
            <>
              {activeCount}
              <span className="text-base font-bold text-text-muted"> / {rows.length}</span>
            </>
          }
          sub={
            rows.length === 0
              ? 'none yet'
              : pausedCount > 0
                ? `${pausedCount} paused`
                : 'all enabled'
          }
        />
        <StatCard
          icon={<SendIcon size={19} />}
          tone="accent"
          label="DMs sent"
          value={totals.hasStats ? numberFormat.format(totals.dmsSent) : '—'}
          sub={totals.hasStats ? 'all-time' : 'stats unavailable'}
        />
        <StatCard
          icon={<ClickIcon size={19} />}
          tone="warm"
          label="Button clicks"
          value={totals.hasStats ? numberFormat.format(totals.linkClicks) : '—'}
          sub={totals.hasStats ? `${ctrLabel} CTR` : 'stats unavailable'}
        />
        <StatCard
          icon={<InstagramIcon size={19} />}
          tone="warm"
          label="Connected accounts"
          value={String(accounts.length)}
          sub={accounts
            .map((account) => `@${account.username ?? account.zernioAccountId}`)
            .join(', ')}
        />
      </div>

      {rows.length > 0 && (
        <section
          aria-labelledby="health-heading"
          className="flex items-center gap-[18px] rounded-[24px] border border-border bg-surface p-[18px] shadow-card"
        >
          <ActivePausedRing active={activeCount} paused={pausedCount} />
          <div className="flex flex-1 flex-col gap-2.5">
            <h2 id="health-heading" className="text-sm font-bold text-text">
              Automation health
            </h2>
            <LegendRow swatch="bg-chart-1" label="Active" value={activeCount} />
            <LegendRow swatch="bg-chart-2" label="Paused" value={pausedCount} />
            <div className="flex justify-between text-[13px]">
              <span className="text-text-muted">Button CTR</span>
              <span className="font-bold text-text">{ctrLabel}</span>
            </div>
          </div>
        </section>
      )}

      {top.length > 0 && (
        <section
          aria-labelledby="top-heading"
          className="flex flex-col gap-3.5 rounded-[24px] border border-border bg-surface p-[18px] shadow-card"
        >
          <div className="flex items-baseline justify-between">
            <h2 id="top-heading" className="text-sm font-bold text-text">
              Top automations
            </h2>
            <span className="text-xs font-semibold text-text-muted">DMs sent, all-time</span>
          </div>
          <TopAutomationBars rows={top} />
        </section>
      )}

      <section className="rounded-[24px] border border-dashed border-border p-[18px]">
        <h2 className="text-sm font-bold text-text">Daily activity</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-text-muted">
          Per-day DMs and comments-vs-DMs charts need event history, which starts recording once
          webhook ingestion lands (Phase 11). Zernio&rsquo;s stats today are all-time totals only.
        </p>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  tone: 'accent' | 'warm';
  label: string;
  value: ReactNode;
  sub: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-[22px] border border-border bg-surface p-4 shadow-card">
      <span
        className={`flex h-[38px] w-[38px] items-center justify-center rounded-xl ${
          tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-accent-2-soft text-accent-2'
        }`}
      >
        {icon}
      </span>
      <span className="text-[12.5px] font-semibold text-text-muted">{label}</span>
      <span className="text-[28px] leading-[30px] font-extrabold tracking-[-0.02em] text-text">
        {value}
      </span>
      <span className="truncate text-xs font-semibold text-text-muted">{sub}</span>
    </div>
  );
}

function LegendRow({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="inline-flex items-center gap-2 text-text-muted">
        <span className={`h-2.5 w-2.5 rounded-[3px] ${swatch}`} aria-hidden="true" />
        {label}
      </span>
      <span className="font-bold text-text">{value}</span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="h-[150px] rounded-[22px] bg-seg" />
        ))}
      </div>
      <div className="h-[146px] rounded-[24px] bg-seg" />
      <div className="h-[200px] rounded-[24px] bg-seg" />
    </div>
  );
}
