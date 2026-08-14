import { cache } from 'react';
import type { OrganizationRole } from '@automationdm/database';
import type { GlobalUserRole } from '@automationdm/shared';
import { callApi } from '@/lib/api';

export interface AdminUserMembership {
  organizationId: string;
  name: string;
  slug: string;
  role: OrganizationRole;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: GlobalUserRole;
  createdAt: string;
  organizations: AdminUserMembership[];
  suggestedSlug: string;
}

export interface AdminOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
}

// Memoized per request (React `cache()`), but deliberately NOT put through `callApiCached`, the
// way the dashboard's reads are.
//
// Durable caching exists on the dashboard because those reads fan out to Zernio and cost
// 0.4-1.7s. These are two plain database reads over a handful of rows. Caching them would buy
// nothing measurable and would add a tag-invalidation contract that every one of the six admin
// mutations would have to remember to honour - and forgetting one fails silently, showing an
// administrator a role they just changed as if the change had not happened. Freshness matters
// more than speed on a screen whose entire purpose is to make changes.
export const getAdminUsers = cache(() => callApi<AdminUserSummary[]>('/api/admin/users'));

export const getAdminOrganizations = cache(() =>
  callApi<AdminOrganizationSummary[]>('/api/admin/organizations'),
);
