import { cache } from 'react';
import type { OrganizationRole } from '@automationdm/database';
import { callApi, callApiCached } from '@/lib/api';
import { cacheTags } from '@/lib/cache-tags';
import type { AutomationListItem } from './automations-browser';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
}

export interface OrganizationMemberSummary {
  id: string;
  role: OrganizationRole;
  user: { id: string; email: string; name: string | null };
}

export interface InstagramAccountSummary {
  id: string;
  zernioAccountId: string;
  username: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
}

// Every fetcher below is wrapped in React's `cache()`, which is what makes the dashboard's
// Suspense split free rather than expensive.
//
// The sections render as independent siblings so the fast ones (accounts, team) can paint while
// the slow one (automations, which fans out to Zernio) is still loading. But several of them need
// the *same* data - the accounts list in particular gates whether the rest of the dashboard
// renders at all. Without memoization each sibling would repeat that HTTP call. With it, the
// first caller pays and the rest read the same in-flight promise, so "just fetch what you need"
// is the correct pattern in every section.
//
// `cache()` is request-scoped, so nothing is shared between users or across requests.

// `cache()` (per-request) and `callApiCached` (durable, cross-request) stack deliberately: the
// inner one avoids repeat HTTP across the Suspense siblings in a single render, the outer one
// avoids it across page loads. Neither replaces the other.
//
// Uncached on purpose: this one gates a `redirect()`, so it must reflect reality the instant an
// organization is created during onboarding. It is also the cheapest call in the app.
export const getOrganizations = cache(() => callApi<OrganizationSummary[]>('/api/organizations'));

export const getMembers = cache((organizationId: string) =>
  callApiCached<OrganizationMemberSummary[]>(`/api/organizations/${organizationId}/members`, {
    tags: [cacheTags.members(organizationId)],
  }),
);

export const getInstagramAccounts = cache((organizationId: string) =>
  callApiCached<InstagramAccountSummary[]>(
    `/api/organizations/${organizationId}/instagram/accounts`,
    { tags: [cacheTags.accounts(organizationId)] },
  ),
);

/** The slow one: apps/api enriches each row with live Zernio stats and post thumbnails, measured
 * at 0.4-1.7s. This is the call both the Suspense split and the cache exist for. */
export const getAutomations = cache((organizationId: string) =>
  callApiCached<AutomationListItem[]>(`/api/organizations/${organizationId}/automations`, {
    tags: [cacheTags.automations(organizationId)],
    // apps/api answers 200 with `stats: null` on every row when the Zernio stats call fails,
    // rather than failing the request. Caching that would pin "stats unavailable" for the whole
    // TTL, so a response where rows exist but not one carries stats is treated as degraded and
    // returned without being stored. A genuinely new automation Zernio has no record of yet looks
    // the same, which costs a cache miss but never shows wrong numbers.
    isDegraded: (automations) =>
      automations.length > 0 && automations.every((automation) => automation.stats === null),
  }),
);

/** Org-wide totals for the stat cards. `hasStats` is false when Zernio returned no stats for any
 * automation (unreachable, or none have stats yet) - the cards then show a dash instead of a
 * fabricated 0, so a failed fetch never reads as "nothing has been sent". CTR is computed from
 * summed trackedSends per Zernio's own spec, not from dmsSent. */
export function sumStats(automations: AutomationListItem[]): {
  hasStats: boolean;
  dmsSent: number;
  linkClicks: number;
  ctr: number | null;
} {
  const withStats = automations.filter((a) => a.stats !== null);
  if (withStats.length === 0) {
    return { hasStats: false, dmsSent: 0, linkClicks: 0, ctr: null };
  }

  let dmsSent = 0;
  let linkClicks = 0;
  // Recovered from each row's own rate rather than exposing trackedSends through the API:
  // clicks / (clicks / rate) === the row's trackedSends, so summing gives the right denominator
  // for an org-wide rate without widening the API surface.
  let trackedSends = 0;
  for (const automation of withStats) {
    const stats = automation.stats;
    if (!stats) continue;
    dmsSent += stats.dmsSent;
    linkClicks += stats.linkClicks;
    if (stats.clickThroughRate !== null && stats.clickThroughRate > 0) {
      trackedSends += (stats.linkClicks / stats.clickThroughRate) * 100;
    }
  }

  return {
    hasStats: true,
    dmsSent,
    linkClicks,
    ctr: trackedSends > 0 ? (linkClicks / trackedSends) * 100 : null,
  };
}
