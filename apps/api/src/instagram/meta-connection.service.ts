import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { MetaConnectionStatus } from '@automationdm/database';
import {
  MetaApiError,
  MetaInstagramClient,
  REFRESH_WHEN_DAYS_REMAINING,
  MIN_TOKEN_AGE_HOURS_BEFORE_REFRESH,
  META_SCOPES,
  buildAuthorizeUrl,
  exchangeCodeForLongLivedToken,
  refreshLongLivedToken,
  signOAuthState,
  verifyOAuthState,
  type MetaOAuthConfig,
} from '@automationdm/meta';
import { decryptToken, encryptToken } from '@automationdm/shared';
import { PrismaService } from '../database/prisma.service';
import { getAppUrl } from '../config/app-url';

// Owns the lifecycle of a direct Meta connection: the OAuth round trip, the encrypted token at
// rest, lazy refresh, and handing out a ready-to-use client.
//
// Why this exists at all: Zernio's post sync is poll-driven and lags a newly published reel by
// hours, so a reel cannot be automated when it most needs to be. See
// docs/ADR/0009-direct-meta-graph-api-for-post-listing.md.
//
// Nothing here writes to Meta. Automations still go through Zernio.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

@Injectable()
export class MetaConnectionService implements OnModuleInit {
  private readonly logger = new Logger(MetaConnectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Reports the Meta redirect URI this process will actually use, once, at startup.
   *
   * Non-obvious and worth the log line: `.env` is read into `process.env` when the process
   * starts, so editing it leaves a long-running `nest start --watch` serving the **old** value
   * indefinitely - a file recompile does not re-read it. During Phase 17 rollout that produced a
   * genuinely confusing state where `.env` said `https://` and the server was still sending
   * `http://`, so the URI registered in the App Dashboard could never match, and Meta reported
   * only its undiagnosable `Invalid redirect_uri`.
   *
   * Printing it at boot means the value in use is visible without clicking anything, and a stale
   * process announces itself. */
  onModuleInit(): void {
    const config = this.getConfig();
    if (!config) {
      this.logger.log('Meta is not configured; post listing will fall back to Zernio.');
      return;
    }
    // Quoted deliberately. An unquoted URI hides the two differences that actually cause
    // Meta's `Invalid redirect_uri`: a trailing slash (Meta's own docs warn "the App Dashboard
    // might have added a trailing slash to your URIs") and trailing whitespace. Both are
    // invisible at the end of a bare log line and both break an exact match.
    this.logger.log(
      `Meta configured: redirect_uri="${config.redirectUri}" - this must equal the App ` +
        "Dashboard's OAuth redirect URIs entry character for character, trailing slash included. " +
        'Copy FROM the dashboard INTO .env, not the other way round.',
    );
  }

  /** Reads Meta app config at call time, not at construction.
   *
   * Same resilience rule as ZERNIO_API_KEY in instagram.module.ts: apps/api must start, and
   * /api/health and /api/ready must answer, on a deployment where Meta was never configured.
   * An unconfigured Meta app simply means every account falls back to Zernio for listing. */
  private getConfig(): MetaOAuthConfig | null {
    const appId = process.env.META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    // Trimmed because this value is copy-pasted between a dashboard field and a .env file, and a
    // single trailing space survives both while making the URI Meta receives non-matching - which
    // Meta reports only as the opaque "Invalid redirect_uri".
    const redirectUri = process.env.META_REDIRECT_URI?.trim();
    if (!appId || !appSecret || !redirectUri) {
      return null;
    }
    return { appId, appSecret, redirectUri };
  }

  /** Checks the redirect URI is one this deployment can actually receive a browser on, and fails
   * with a message naming the fix.
   *
   * This exists because of a real dead end hit during Phase 17 rollout. Meta reports **every**
   * problem with the authorize request - unregistered URI, wrong scheme, stray whitespace - as
   * the same flat `Invalid redirect_uri` on an instagram.com error page, with no indication of
   * which URI it compared against or why. Worse, a URI that Meta *accepts* but this app cannot
   * serve (`https://localhost:3000` while `next dev` serves plain HTTP) fails only **after** the
   * user has granted consent, as a browser connection error on the way back - by which point the
   * authorization code is already spent.
   *
   * Catching the scheme/origin mismatch here turns both into a local error naming the two values
   * that disagree. What it cannot check is whether the URI is registered in the App Dashboard -
   * only Meta knows that - which is why the exact string is logged for copy-paste. */
  private assertUsableRedirectUri(redirectUri: string): void {
    let parsed: URL;
    try {
      parsed = new URL(redirectUri);
    } catch {
      throw new BadRequestException(
        `META_REDIRECT_URI is not an absolute URL: "${redirectUri}". It must be the full callback ` +
          'URL, e.g. http://localhost:3000/instagram/meta/callback.',
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(
        `META_REDIRECT_URI must be http or https, got "${parsed.protocol}".`,
      );
    }

    // APP_URL is apps/api's own view of where apps/web is reachable - the same value the Zernio
    // callback is built from. If the Meta callback lives on a different origin, the browser round
    // trip cannot complete even when Meta is perfectly happy with the URI.
    const appUrl = getAppUrl();
    let appOrigin: string;
    try {
      appOrigin = new URL(appUrl).origin;
    } catch {
      // A malformed APP_URL is a separate misconfiguration; do not mask the Meta one behind it.
      return;
    }

    if (parsed.origin !== appOrigin) {
      throw new BadRequestException(
        `META_REDIRECT_URI ("${parsed.origin}") is on a different origin from APP_URL ` +
          `("${appOrigin}"), so the browser cannot return here after consent. Set both to the ` +
          'same scheme, host and port. For local development that is normally ' +
          `"${appOrigin}/instagram/meta/callback" - and remember to register that exact string ` +
          'in App Dashboard > Instagram > API setup with Instagram login > Set up Instagram ' +
          'business login > Business login settings > OAuth redirect URIs.',
      );
    }
  }

  /** True when this deployment can offer a Meta connection at all. apps/web uses this to decide
   * whether to show the "Connect Meta" affordance rather than offering a button that 400s. */
  isConfigured(): boolean {
    return this.getConfig() !== null;
  }

  /** Builds the URL to send the user's browser to, binding the flow to this user, organization
   * and Instagram account via a signed, expiring `state`. */
  createAuthorizeUrl(userId: string, organizationId: string, instagramAccountId: string): string {
    const config = this.requireConfig();
    this.assertUsableRedirectUri(config.redirectUri);

    const state = signOAuthState({ organizationId, instagramAccountId, userId }, config.appSecret);
    const authUrl = buildAuthorizeUrl(config, state);

    // Logged because Meta's "Invalid redirect_uri" page never says which URI it rejected, and the
    // only reliable fix is a character-exact match against the App Dashboard field. Copy this
    // string into "OAuth redirect URIs" rather than retyping it.
    //
    // Safe to log: `redirect_uri`, `client_id` and `scope` are all public values that travel in
    // the user's own browser. The app secret and the signed `state` are deliberately not included.
    this.logger.log(
      `Meta authorize: redirect_uri=${config.redirectUri} client_id=${config.appId} ` +
        `scope=${META_SCOPES.join(',')}`,
    );

    return authUrl;
  }

  /** Completes the OAuth round trip and stores the connection.
   *
   * The `state` is verified before anything else happens - it is the only thing establishing
   * that this callback belongs to a flow we started, for the organization it claims. The
   * account is then re-checked against that organization, the same "never trust a value that
   * arrived through the end user's browser" discipline as the Zernio callback handler. */
  async handleCallback(
    rawCode: unknown,
    rawState: unknown,
  ): Promise<{ igUserId: string; instagramAccountId: string; organizationId: string }> {
    const config = this.requireConfig();

    if (typeof rawCode !== 'string' || !rawCode) {
      throw new BadRequestException('Missing authorization code.');
    }
    if (typeof rawState !== 'string' || !rawState) {
      throw new BadRequestException('Missing OAuth state.');
    }

    let state;
    try {
      state = verifyOAuthState(rawState, config.appSecret);
    } catch {
      // Deliberately not echoing the underlying reason - a forged-state probe should not learn
      // whether it failed on the signature, the shape, or the expiry.
      throw new BadRequestException('Invalid or expired OAuth state.');
    }

    // The account must still exist and still belong to the organization the state names. A
    // membership check happens in the controller's guard chain; this is the tenant check.
    const account = await this.prisma.client.instagramAccount.findUnique({
      where: { id: state.instagramAccountId },
    });
    if (!account || account.organizationId !== state.organizationId) {
      throw new NotFoundException('Instagram account not found.');
    }

    const token = await exchangeCodeForLongLivedToken(config, rawCode);

    // Independently confirm who the token actually belongs to rather than trusting the flow.
    // Without this we would store a token for whichever Instagram account the user happened to
    // pick in Meta's UI, labelled as the account they started from.
    const profile = await new MetaInstagramClient(token.accessToken).getProfile();

    await this.prisma.client.metaConnection.upsert({
      where: { instagramAccountId: account.id },
      create: {
        organizationId: account.organizationId,
        instagramAccountId: account.id,
        igUserId: profile.igUserId,
        accessTokenEncrypted: encryptToken(token.accessToken),
        expiresAt: token.expiresAt,
        scopes: [...META_SCOPES],
        status: MetaConnectionStatus.CONNECTED,
      },
      update: {
        igUserId: profile.igUserId,
        accessTokenEncrypted: encryptToken(token.accessToken),
        expiresAt: token.expiresAt,
        scopes: [...META_SCOPES],
        // A reconnect is precisely how a RECONNECT_REQUIRED connection is meant to recover.
        status: MetaConnectionStatus.CONNECTED,
      },
    });

    return {
      igUserId: profile.igUserId,
      instagramAccountId: account.id,
      organizationId: account.organizationId,
    };
  }

  /** Returns a usable client for an account, or null when there is no usable Meta connection.
   *
   * Null - not an exception - because every caller's correct response to "no Meta connection"
   * is to fall back to Zernio, and making that the exceptional path would turn the ordinary
   * state of an un-connected account into noise. */
  async getClient(instagramAccountId: string): Promise<MetaInstagramClient | null> {
    const connection = await this.prisma.client.metaConnection.findUnique({
      where: { instagramAccountId },
    });
    if (!connection || connection.status !== MetaConnectionStatus.CONNECTED) {
      return null;
    }

    // An already-expired token cannot be refreshed - Meta requires an unexpired one - so this
    // is terminal until the user reconnects.
    if (connection.expiresAt.getTime() <= Date.now()) {
      await this.markReconnectRequired(instagramAccountId, 'stored token expired');
      return null;
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(connection.accessTokenEncrypted);
    } catch (error) {
      // An unreadable token means the encryption key changed (or the row was tampered with).
      // Surfaced as "reconnect" rather than crashing the page, but logged loudly because the
      // usual cause is a misconfigured META_TOKEN_ENCRYPTION_KEY, not anything the user did.
      this.logger.error(
        `Could not decrypt the stored Meta token for account ${instagramAccountId}. ` +
          'Check META_TOKEN_ENCRYPTION_KEY has not changed.',
        error instanceof Error ? error.stack : undefined,
      );
      await this.markReconnectRequired(instagramAccountId, 'token could not be decrypted');
      return null;
    }

    const refreshed = await this.refreshIfDue(connection.id, instagramAccountId, {
      accessToken,
      expiresAt: connection.expiresAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    });

    return new MetaInstagramClient(refreshed);
  }

  /** Extends the token when it is inside its last few days.
   *
   * Best effort on purpose: a refresh failure does not stop the current request, because the
   * existing token is still valid today. It only means the connection is now on a countdown,
   * which the RECONNECT_REQUIRED status makes visible before it runs out. */
  private async refreshIfDue(
    connectionId: string,
    instagramAccountId: string,
    token: { accessToken: string; expiresAt: Date; createdAt: Date; updatedAt: Date },
  ): Promise<string> {
    const daysRemaining = (token.expiresAt.getTime() - Date.now()) / MS_PER_DAY;
    if (daysRemaining > REFRESH_WHEN_DAYS_REMAINING) {
      return token.accessToken;
    }

    // Meta refuses to refresh a token younger than 24 hours. A token that new is already good
    // for ~60 days, so this can only be a harmless skip.
    const ageHours = (Date.now() - token.updatedAt.getTime()) / MS_PER_HOUR;
    if (ageHours < MIN_TOKEN_AGE_HOURS_BEFORE_REFRESH) {
      return token.accessToken;
    }

    try {
      const next = await refreshLongLivedToken(token.accessToken);
      await this.prisma.client.metaConnection.update({
        where: { id: connectionId },
        data: {
          accessTokenEncrypted: encryptToken(next.accessToken),
          expiresAt: next.expiresAt,
        },
      });
      return next.accessToken;
    } catch (error) {
      if (error instanceof MetaApiError && error.isAuthError) {
        await this.markReconnectRequired(instagramAccountId, 'refresh rejected by Meta');
      } else {
        this.logger.warn(
          `Meta token refresh failed for account ${instagramAccountId}; continuing with the ` +
            `existing token, which is valid for ${Math.floor(daysRemaining)} more day(s).`,
        );
      }
      return token.accessToken;
    }
  }

  /** Records a successful use. Purely observability - it is what tells a human "this connection
   * is live" without them having to trigger a call to find out. */
  async recordSuccess(instagramAccountId: string): Promise<void> {
    await this.prisma.client.metaConnection
      .update({ where: { instagramAccountId }, data: { lastUsedAt: new Date() } })
      .catch(() => {
        // A bookkeeping write must never fail the read it was decorating.
      });
  }

  /** Marks a connection as needing the user to reconnect.
   *
   * Only called for token-level failures (Meta rejecting the credential), never for a transient
   * error - a Meta outage must recover on its own rather than demanding the user re-authorize. */
  async markReconnectRequired(instagramAccountId: string, reason: string): Promise<void> {
    this.logger.warn(
      `Meta connection for account ${instagramAccountId} needs reconnect: ${reason}`,
    );
    await this.prisma.client.metaConnection
      .update({
        where: { instagramAccountId },
        data: { status: MetaConnectionStatus.RECONNECT_REQUIRED },
      })
      .catch(() => {
        // The connection may have been deleted concurrently; nothing to mark.
      });
  }

  async disconnect(organizationId: string, instagramAccountId: string): Promise<void> {
    await this.prisma.client.metaConnection.deleteMany({
      where: { instagramAccountId, organizationId },
    });
  }

  private requireConfig(): MetaOAuthConfig {
    const config = this.getConfig();
    if (!config) {
      throw new BadRequestException(
        'Meta is not configured on this deployment (META_APP_ID, META_APP_SECRET, META_REDIRECT_URI).',
      );
    }
    return config;
  }
}
