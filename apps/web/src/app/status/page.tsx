import { getApiUrl } from '@/lib/env';

interface ApiHealth {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

type HealthCheckResult = { reachable: true; data: ApiHealth } | { reachable: false; error: string };

async function getApiHealth(): Promise<HealthCheckResult> {
  const apiUrl = getApiUrl();
  try {
    const res = await fetch(`${apiUrl}/api/health`, { cache: 'no-store' });
    if (!res.ok) {
      return { reachable: false, error: `API responded with HTTP ${res.status}` };
    }
    const data = (await res.json()) as ApiHealth;
    return { reachable: true, data };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default async function StatusPage() {
  const health = await getApiHealth();
  const apiUrl = getApiUrl();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">System status</h1>
      {health.reachable ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <p className="font-medium">API reachable</p>
          <pre className="mt-2 overflow-x-auto text-sm">{JSON.stringify(health.data, null, 2)}</pre>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="font-medium">API not reachable</p>
          <p className="mt-1 text-sm">{health.error}</p>
          <p className="mt-1 text-sm">
            Expected at{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5">{apiUrl}/api/health</code> — start it
            with{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5">
              pnpm --filter @automationdm/api run dev
            </code>
            .
          </p>
        </div>
      )}
    </div>
  );
}
