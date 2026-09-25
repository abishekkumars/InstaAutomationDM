import { getApiUrl } from '@/lib/env';
import { getApiHealth } from '@/app/status/status-data';

export async function DesktopStatusView() {
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
