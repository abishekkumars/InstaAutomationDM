import { signInternalServiceToken } from '@automationdm/shared';
import { auth } from '@/auth';
import { getApiUrl } from './env';

// Server-side only (never called from a Client Component - there is no browser-safe way to
// hand out API_INTERNAL_SECRET). See docs/ARCHITECTURE.md's "Session verification (Phase 6)"
// section and packages/shared/src/internal-service-token.ts for why apps/api is called this
// way rather than apps/web reaching into Prisma directly for org data, and why this doesn't
// just forward Auth.js's own session cookie.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function authorizationHeader(): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('callApi() used without an authenticated session.');
  }

  const secret = process.env.API_INTERNAL_SECRET;
  if (!secret) {
    throw new Error('API_INTERNAL_SECRET is not configured.');
  }

  const token = signInternalServiceToken(
    { sub: session.user.id, email: session.user.email ?? '' },
    secret,
  );
  return `Bearer ${token}`;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export async function callApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const authorization = await authorizationHeader();

  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body: ApiErrorBody | null = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.message ?? `API request failed (${response.status}).`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
