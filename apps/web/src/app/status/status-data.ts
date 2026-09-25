import { getApiUrl } from '@/lib/env';

export interface ApiHealth {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

export type HealthCheckResult =
  { reachable: true; data: ApiHealth; latencyMs: number } | { reachable: false; error: string };

/** apps/api's public health endpoint. Shared by the desktop and mobile status views
 * (docs/ADR/0010-device-specific-views.md). Never throws: an unreachable API is the result
 * this page exists to report, not an error. `latencyMs` is the round trip from this server. */
export async function getApiHealth(): Promise<HealthCheckResult> {
  const apiUrl = getApiUrl();
  const startedAt = performance.now();
  try {
    const res = await fetch(`${apiUrl}/api/health`, { cache: 'no-store' });
    if (!res.ok) {
      return { reachable: false, error: `API responded with HTTP ${res.status}` };
    }
    const data = (await res.json()) as ApiHealth;
    return { reachable: true, data, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
