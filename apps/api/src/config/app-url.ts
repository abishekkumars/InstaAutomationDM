// apps/api's own view of where apps/web is reachable, used to build the redirect_url passed
// to Zernio's OAuth connect flow (docs/ZERNIO-INTEGRATION.md). Deliberately a separate env
// var from apps/web's NEXT_PUBLIC_APP_URL rather than trusting a client-supplied redirect
// URL - apps/api constructs this itself, the same trust boundary as every other
// organization-scoped value in this codebase (see docs/DATABASE.md's tenant isolation rule).
export function getAppUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000';
}
