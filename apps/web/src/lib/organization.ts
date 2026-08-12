import { cache } from 'react';
import { callApi } from './api';

/** The caller's primary organization id.
 *
 * This app has no multi-org switcher yet, so "primary" means "the first one the API returns" -
 * the same convention the dashboard has always used. It was duplicated verbatim in both posts
 * pages; keeping one copy means the memoization below actually applies everywhere.
 *
 * Memoized per request with React's `cache()`: several server components on the same page need
 * the org id to build their API paths, and without this each one would repeat the
 * `/api/organizations` round trip. Request-scoped, so it never bleeds between users.
 */
export const getPrimaryOrganizationId = cache(async (): Promise<string | null> => {
  const organizations = await callApi<Array<{ id: string }>>('/api/organizations');
  return organizations[0]?.id ?? null;
});
