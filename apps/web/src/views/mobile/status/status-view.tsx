import type { ReactNode } from 'react';
import { getInstagramAccounts, getMetaConnection } from '@/app/dashboard-data';
import { getApiHealth } from '@/app/status/status-data';
import { getActiveOrganization } from '@/lib/organization';
import { LoadingLink } from '@/views/shared/loader';
import { MetaMark, ZernioMark } from '@/views/shared/platform-badge';
import { PulseIcon } from '../icons';
import { MobilePageHeader } from '../page-header';
import { RefreshStatusButton } from './refresh-button';

type Tone = 'good' | 'warn' | 'neutral';

interface ServiceRow {
  key: string;
  icon: ReactNode;
  name: string;
  detail: string;
  status: string;
  tone: Tone;
}

const PILL: Record<Tone, string> = {
  good: 'bg-success-bg text-success',
  warn: 'bg-warn-bg text-warn',
  neutral: 'bg-seg text-text-muted',
};

/** The mobile Status tab (Phase 18.5): live health of the API and of the active organization's
 * Zernio and Meta connections, re-checked on every render and on "Check now".
 *
 * Only what is measured right now is shown. The approved design's uptime bar and recent-activity
 * feed need recorded history that does not exist yet (health checks are not stored; webhook
 * events arrive with Phase 11), so neither is drawn - see docs/ADR/0010-device-specific-views.md.
 *
 * `/status` is public, so this also renders signed out, with the API check alone. */
export async function MobileStatusView({ signedIn }: { signedIn: boolean }) {
  const health = await getApiHealth();
  const rows: ServiceRow[] = [
    health.reachable
      ? {
          key: 'api',
          icon: <PulseIcon size={19} />,
          name: 'API server',
          detail: `Healthy · ${health.latencyMs} ms`,
          status: 'Operational',
          tone: 'good',
        }
      : {
          key: 'api',
          icon: <PulseIcon size={19} />,
          name: 'API server',
          detail: health.error,
          status: 'Unreachable',
          tone: 'warn',
        },
  ];

  if (signedIn && health.reachable) {
    rows.push(...(await connectionRows()));
  }

  const needsAttention = rows.some((row) => row.tone === 'warn');

  // Status is reached from Settings since Phase 19, so it offers the way back. Signed out there
  // is no Settings page to return to.
  const backButton = signedIn ? (
    <LoadingLink
      href="/settings"
      aria-label="Back to settings"
      className="flex h-11 items-center gap-1 rounded-[14px] border border-border bg-surface pr-3.5 pl-2 text-sm font-bold text-text"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      Settings
    </LoadingLink>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {backButton && <div>{backButton}</div>}
      <MobilePageHeader
        eyebrow="System"
        title="Status"
        compactSubtitle={needsAttention ? 'Needs attention' : 'All systems operational'}
        compactLeading={backButton}
      />

      <section className="flex flex-col gap-4 rounded-[26px] border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <span
            className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full ${
              needsAttention ? 'bg-warn-bg text-warn' : 'bg-success-bg text-success'
            }`}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {needsAttention ? <path d="M12 8v5M12 16.5h.01" /> : <path d="M20 6 9 17l-5-5" />}
            </svg>
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-[17px] font-extrabold text-text">
              {needsAttention ? 'Some services need attention' : 'All systems operational'}
            </p>
            <p className="text-[13px] text-text-muted">Checked just now</p>
          </div>
        </div>
        <RefreshStatusButton />
      </section>

      <h2 className="px-1 text-xs font-bold tracking-[0.06em] text-text-muted uppercase">
        Services
      </h2>
      <ul className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-card">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className={`flex items-center gap-3 px-4 py-3.5 ${index > 0 ? 'border-t border-border' : ''}`}
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              {row.icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14.5px] font-bold text-text">{row.name}</span>
              <span className="truncate text-[12.5px] text-text-muted">{row.detail}</span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${PILL[row.tone]}`}
            >
              {row.status}
            </span>
          </li>
        ))}
      </ul>

      <p className="px-1 text-[12.5px] leading-5 text-text-muted">
        Uptime history and a recent-activity feed need recorded events, which start with webhook
        ingestion (Phase 11).
      </p>
    </div>
  );
}

/** Zernio and Meta rows for the active organization's first connected account - the one account
 * the + tab also uses. Never throws: a failed lookup becomes a row that says so. */
async function connectionRows(): Promise<ServiceRow[]> {
  const organization = (await getActiveOrganization().catch(() => null))?.active ?? null;
  if (!organization) {
    return [];
  }
  const accounts = await getInstagramAccounts(organization.id).catch(() => null);
  if (accounts === null) {
    return [
      {
        key: 'zernio',
        icon: <ZernioMark className="h-[19px] w-[19px]" />,
        name: 'Zernio',
        detail: 'Could not read the connection',
        status: 'Unknown',
        tone: 'warn',
      },
    ];
  }
  const account = accounts[0];
  if (!account) {
    return [
      {
        key: 'zernio',
        icon: <ZernioMark className="h-[19px] w-[19px]" />,
        name: 'Zernio',
        detail: 'No Instagram account connected',
        status: 'Not connected',
        tone: 'neutral',
      },
    ];
  }

  const handle = `@${account.username ?? account.zernioAccountId}`;
  const meta = await getMetaConnection(organization.id, account.id);
  const zernioConnected = account.status === 'CONNECTED';

  return [
    {
      key: 'zernio',
      icon: <ZernioMark className="h-[19px] w-[19px]" />,
      name: 'Zernio',
      detail: `Runs the automations · ${handle}`,
      status: zernioConnected ? 'Connected' : account.status === 'ERROR' ? 'Error' : 'Disconnected',
      tone: zernioConnected ? 'good' : 'warn',
    },
    meta?.status === 'CONNECTED'
      ? {
          key: 'meta',
          icon: <MetaMark className="h-[19px] w-[19px]" />,
          name: 'Meta',
          detail: 'New posts appear instantly',
          status: 'On',
          tone: 'good',
        }
      : meta?.status === 'RECONNECT_REQUIRED'
        ? {
            key: 'meta',
            icon: <MetaMark className="h-[19px] w-[19px]" />,
            name: 'Meta',
            detail: 'Token rejected - reconnect in Settings',
            status: 'Reconnect',
            tone: 'warn',
          }
        : {
            key: 'meta',
            // Optional by design (ADR 0009): without it the post list falls back to Zernio's own
            // sync, which can lag a few hours. Not an outage, so not a warning.
            icon: <MetaMark className="h-[19px] w-[19px]" />,
            name: 'Meta',
            detail: 'Optional - posts sync through Zernio',
            status: 'Off',
            tone: 'neutral',
          },
  ];
}
