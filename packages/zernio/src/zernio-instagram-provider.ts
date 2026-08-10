import type {
  ConnectedInstagramAccount,
  EnsureProfileInput,
  EnsureProfileResult,
  FindConnectedAccountInput,
  GetConnectUrlInput,
  GetConnectUrlResult,
  InstagramProvider,
} from './instagram-provider';

// Base URL + auth scheme, and every endpoint shape below, verified directly against Zernio's
// live OpenAPI spec (docs.zernio.com/api/openapi) during Phase 8 - see
// docs/ZERNIO-INTEGRATION.md's "Account connection" section, not invented here per CLAUDE.md.
export const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

interface ZernioErrorBody {
  error?: string;
  message?: string;
  code?: string;
  details?: { existingProfileId?: string };
}

class ZernioApiError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    public readonly body: ZernioErrorBody | undefined,
  ) {
    super(
      `Zernio API error: ${method} ${path} -> ${status} ${body?.message ?? body?.error ?? ''}`.trim(),
    );
  }
}

export class ZernioInstagramProvider implements InstagramProvider {
  constructor(private readonly apiKey: string) {}

  async ensureProfile(input: EnsureProfileInput): Promise<EnsureProfileResult> {
    try {
      const response = await this.request<{ profile: { _id: string } }>('POST', '/profiles', {
        name: input.name,
      });
      return { zernioProfileId: response.profile._id };
    } catch (error) {
      // A duplicate profile name (409) is expected on a retried create after a prior attempt
      // created the Zernio profile but failed before we could persist its id locally -
      // recover the existing profile id instead of leaving the organization stuck.
      if (
        error instanceof ZernioApiError &&
        error.status === 409 &&
        error.body?.details?.existingProfileId
      ) {
        return { zernioProfileId: error.body.details.existingProfileId };
      }
      throw error;
    }
  }

  async getConnectUrl(input: GetConnectUrlInput): Promise<GetConnectUrlResult> {
    const query = new URLSearchParams({
      profileId: input.zernioProfileId,
      redirect_url: input.redirectUrl,
    });
    const response = await this.request<{ authUrl: string }>(
      'GET',
      `/connect/instagram?${query.toString()}`,
    );
    return { authUrl: response.authUrl };
  }

  async findConnectedAccount(
    input: FindConnectedAccountInput,
  ): Promise<ConnectedInstagramAccount | null> {
    const query = new URLSearchParams({ profileId: input.zernioProfileId, platform: 'instagram' });
    const response = await this.request<{
      accounts: Array<{ _id: string; username?: string | null }>;
    }>('GET', `/accounts?${query.toString()}`);

    const account = response.accounts[0];
    if (!account) {
      return null;
    }
    return { zernioAccountId: account._id, username: account.username ?? null };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.apiKey) {
      // Lazy check (not thrown at DI-construction time) so apps/api's health/readiness
      // endpoints stay up even if ZERNIO_API_KEY is unset - same pattern as
      // apps/api/src/auth/session.guard.ts's API_INTERNAL_SECRET check.
      throw new Error('ZERNIO_API_KEY is not configured.');
    }

    const response = await fetch(`${ZERNIO_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => undefined)) as
        ZernioErrorBody | undefined;
      throw new ZernioApiError(method, path, response.status, errorBody);
    }

    return (await response.json()) as T;
  }
}
