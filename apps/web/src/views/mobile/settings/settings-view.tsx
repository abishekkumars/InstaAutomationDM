import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';
import { getCurrentUser } from '@/lib/me';
import { getActiveOrganization } from '@/lib/organization';
import { getInstagramAccounts, getMembers, getMetaConnection } from '@/app/dashboard-data';
import {
  connectInstagramAction,
  connectMetaAction,
  disconnectMetaAction,
} from '@/app/instagram/actions';
import { setViewPreferenceAction } from '@/app/view-actions';
import { FormPendingOverlay, LoadingLink } from '@/views/shared/loader';
import { OrganizationSwitcher } from '@/views/shared/organization-switcher';
import { MetaMark, ZernioMark } from '@/views/shared/platform-badge';
import { InstagramIcon } from '../icons';
import { MobilePageHeader } from '../page-header';
import { SignOutSheet } from './sign-out-sheet';
import { ThemePicker } from './theme-picker';

/** The mobile Settings tab (Phase 18.5): who you are, which organization you are looking at,
 * appearance, the connected Instagram account, the team, and - at the bottom - "Use desktop
 * site" and Sign out.
 *
 * Every lookup here degrades instead of failing the page: Settings is where the user goes to fix
 * things (reconnect an account, switch organization, sign out), so an API hiccup must never take
 * the Sign out button with it. The approved design's notification switches are not here -
 * nothing sends notifications yet, and a switch that does nothing would be a lie. */
export async function MobileSettingsView() {
  const [session, user, organizationState] = await Promise.all([
    getSession(),
    getCurrentUser().catch(() => null),
    getActiveOrganization().catch(() => ({ organizations: [], active: null })),
  ]);
  const organization = organizationState.active;

  const [accounts, members] = organization
    ? await Promise.all([
        getInstagramAccounts(organization.id).catch(() => null),
        getMembers(organization.id).catch(() => null),
      ])
    : [null, null];
  const metaByAccount = new Map(
    organization && accounts
      ? await Promise.all(
          accounts.map(
            async (account) =>
              [account.id, await getMetaConnection(organization.id, account.id)] as const,
          ),
        )
      : [],
  );

  const displayName = session?.user?.name ?? session?.user?.email ?? user?.email ?? 'Your account';
  const email = session?.user?.email ?? user?.email ?? null;
  const initial = displayName.charAt(0).toUpperCase();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-3.5">
      <MobilePageHeader title="Settings" compactSubtitle={displayName} />

      <section className="flex items-center gap-3.5 rounded-[24px] border border-border bg-surface p-4 shadow-card">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-[19px] font-extrabold text-accent-ink">
          {initial}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[17px] font-extrabold text-text">{displayName}</span>
          {email && email !== displayName && (
            <span className="truncate text-[13px] text-text-muted">{email}</span>
          )}
          <span className="text-[13px] text-text-muted">
            {isAdmin ? 'Administrator' : 'Member'}
            {organization ? ` · ${organization.name}` : ''}
          </span>
        </span>
      </section>

      {organizationState.organizations.length > 0 && (
        <>
          <SectionTitle>Organization</SectionTitle>
          <OrganizationSwitcher
            organizations={organizationState.organizations}
            activeId={organization?.id ?? null}
            tone="light"
            returnTo="/settings"
          />
        </>
      )}

      <SectionTitle>Appearance</SectionTitle>
      <ThemePicker />

      {organization && (
        <>
          <SectionTitle>Connected account</SectionTitle>
          {accounts === null ? (
            <Card>
              <p className="px-4 py-3.5 text-sm text-text-muted">
                Could not load the connected account right now.
              </p>
            </Card>
          ) : accounts.length === 0 ? (
            <Card>
              <div className="flex flex-col gap-3 p-4">
                <p className="text-sm text-text-muted">
                  No Instagram account connected to {organization.name} yet.
                </p>
                <form action={connectInstagramAction}>
                  <FormPendingOverlay />
                  <input type="hidden" name="organizationId" value={organization.id} />
                  <button
                    type="submit"
                    className="h-12 w-full rounded-2xl bg-accent text-[15px] font-bold text-accent-ink"
                  >
                    Connect Instagram
                  </button>
                </form>
              </div>
            </Card>
          ) : (
            accounts.map((account) => {
              const meta = metaByAccount.get(account.id) ?? null;
              const zernioConnected = account.status === 'CONNECTED';
              const metaConnected = meta?.status === 'CONNECTED';
              const metaReconnect = meta?.status === 'RECONNECT_REQUIRED';
              return (
                <Card key={account.id}>
                  <Row
                    icon={
                      <span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-accent-2-soft text-accent-2">
                        <InstagramIcon size={19} />
                      </span>
                    }
                    title={`@${account.username ?? account.zernioAccountId}`}
                    detail="Instagram Business"
                  />
                  <Row
                    icon={
                      <IconTile>
                        <ZernioMark className="h-[18px] w-[18px]" />
                      </IconTile>
                    }
                    title="Zernio"
                    detail={
                      zernioConnected
                        ? 'Connected · runs the automations'
                        : account.status === 'ERROR'
                          ? 'Error - reconnect to resume automations'
                          : 'Disconnected - automations are not running'
                    }
                    action={
                      zernioConnected ? null : (
                        <form action={connectInstagramAction}>
                          <FormPendingOverlay />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <SmallButton filled>Connect</SmallButton>
                        </form>
                      )
                    }
                  />
                  <Row
                    icon={
                      <IconTile>
                        <MetaMark className="h-[18px] w-[18px]" />
                      </IconTile>
                    }
                    title="Meta"
                    detail={
                      metaConnected
                        ? 'Instant sync on'
                        : metaReconnect
                          ? 'Reconnect needed'
                          : 'Off - posts sync through Zernio'
                    }
                    action={
                      metaConnected ? (
                        // Not destructive (ADR 0009): listing falls back to Zernio's sync and
                        // every automation keeps running - unlike disconnecting Zernio, which
                        // is deliberately not offered anywhere in the app.
                        <form action={disconnectMetaAction}>
                          <FormPendingOverlay />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="accountId" value={account.id} />
                          <SmallButton>Disconnect</SmallButton>
                        </form>
                      ) : (
                        <form action={connectMetaAction}>
                          <FormPendingOverlay />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="accountId" value={account.id} />
                          <SmallButton filled>
                            {metaReconnect ? 'Reconnect' : 'Connect'}
                          </SmallButton>
                        </form>
                      )
                    }
                  />
                </Card>
              );
            })
          )}

          {members && members.length > 0 && (
            <>
              <SectionTitle>Team</SectionTitle>
              <Card>
                {members.map((member) => (
                  <Row
                    key={member.id}
                    icon={
                      <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-seg text-sm font-bold text-text">
                        {(member.user.name ?? member.user.email).charAt(0).toUpperCase()}
                      </span>
                    }
                    title={member.user.name ?? member.user.email}
                    detail={member.role.toLowerCase()}
                  />
                ))}
              </Card>
            </>
          )}
        </>
      )}

      <SectionTitle>App</SectionTitle>
      <Card>
        {isAdmin && (
          <LoadingLink href="/admin" className="flex items-center gap-3 px-4 py-3 text-text">
            <IconTile>
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </IconTile>
            <span className="flex-1 text-[14.5px] font-bold">Administration</span>
            <Chevron />
          </LoadingLink>
        )}
        <form action={setViewPreferenceAction}>
          <FormPendingOverlay />
          <input type="hidden" name="view" value="desktop" />
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-text"
          >
            <IconTile>
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="20" height="13" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </IconTile>
            <span className="flex flex-1 flex-col">
              <span className="text-[14.5px] font-bold">Use desktop site</span>
              <span className="text-[12.5px] text-text-muted">
                Switch back any time from the top bar
              </span>
            </span>
            <Chevron />
          </button>
        </form>
      </Card>

      <div className="mt-1.5 flex flex-col">
        <SignOutSheet />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 pt-1.5 text-xs font-bold tracking-[0.06em] text-text-muted uppercase">
      {children}
    </h2>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[22px] border border-border bg-surface shadow-card [&>*+*]:border-t [&>*+*]:border-border">
      {children}
    </div>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-seg text-text">
      {children}
    </span>
  );
}

function Row({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14.5px] font-bold text-text">{title}</span>
        {detail && <span className="text-[12.5px] text-text-muted">{detail}</span>}
      </span>
      {action}
    </div>
  );
}

function SmallButton({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <button
      type="submit"
      className={`h-9 shrink-0 rounded-[11px] px-3 text-[13px] font-bold ${
        filled ? 'bg-accent text-accent-ink' : 'border border-border bg-surface-2 text-text'
      }`}
    >
      {children}
    </button>
  );
}

function Chevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-text-muted"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
