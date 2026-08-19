import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { callApi } from '@/lib/api';
import { invalidateOrganizationCaches } from '@/lib/revalidate';

// Where Meta redirects the browser after Business Login consent (Phase 17). Must match
// META_REDIRECT_URI on the Meta app EXACTLY - Meta rejects a near-match rather than
// normalising it.
//
// A Route Handler for the same reasons as the Zernio callback next door: it renders nothing,
// always redirects, and has to call `revalidateTag`, which throws during a Server Component
// render.
//
// The organization cannot travel in the query string: Meta requires the redirect URI to match
// the registered META_REDIRECT_URI exactly, so it is one fixed URL for every organization. It
// rides inside `state` instead.
//
// `state` is read here WITHOUT verifying it - this route only needs to know which apps/api
// route to POST to. apps/api verifies the signature, the expiry, and the organization/account
// binding before anything is written, and rejects a mismatch. Nothing is trusted on the
// strength of this decode.
function readOrganizationIdFromState(state: string): string | null {
  try {
    const [encoded] = state.split('.');
    if (!encoded) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      organizationId?: unknown;
    };
    return typeof payload.organizationId === 'string' ? payload.organizationId : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<never> {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');

  // Meta reports a declined consent screen as `error`/`error_reason` rather than omitting the
  // code, so a user who simply pressed "Cancel" gets a distinct outcome instead of a generic
  // failure banner.
  if (params.get('error')) {
    redirect('/?meta=cancelled');
  }

  if (!code || !state) {
    redirect('/?meta=error');
  }

  const organizationId = readOrganizationIdFromState(state);
  if (!organizationId) {
    redirect('/?meta=error');
  }

  try {
    await callApi(`/api/organizations/${organizationId}/instagram/meta/callback`, {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    });
  } catch (error) {
    console.error('[meta] callback confirmation failed:', error);
    redirect('/?meta=error');
  }

  // The post list is cached for 60s by tag (ADR 0006). Without this, a user who has just
  // connected Meta lands on a list rendered from a cache entry written while the account was
  // still Zernio-only - it would still be missing the very reel they connected Meta to see,
  // which reads as the connection having failed.
  invalidateOrganizationCaches(organizationId, '/');

  redirect('/?meta=connected');
}
