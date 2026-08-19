import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { InstagramPost, ListPostsResult } from '@automationdm/zernio';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import {
  InstagramService,
  type ConnectResult,
  type InstagramAccountSummary,
  type MetaConnectionSummary,
} from './instagram.service';

@Controller('organizations/:organizationId/instagram')
@UseGuards(SessionGuard)
export class InstagramController {
  constructor(private readonly instagram: InstagramService) {}

  @Get('accounts')
  listAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
  ): Promise<InstagramAccountSummary[]> {
    return this.instagram.listAccounts(user.id, organizationId);
  }

  @Post('connect')
  createConnectUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
  ): Promise<ConnectResult> {
    return this.instagram.createConnectUrl(user.id, organizationId);
  }

  @Post('callback')
  handleCallback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ): Promise<InstagramAccountSummary> {
    return this.instagram.handleCallback(user.id, organizationId, body);
  }

  @Get('accounts/:accountId/posts')
  listPosts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('accountId') accountId: string,
    @Query() query: unknown,
  ): Promise<ListPostsResult> {
    return this.instagram.listPosts(user.id, organizationId, accountId, query);
  }

  /** `:postId` is **Instagram's own media id** since Phase 17, not Zernio's `_id` - see
   * docs/ADR/0009-direct-meta-graph-api-for-post-listing.md. Bookmarked links carrying the old
   * id no longer resolve. */
  @Get('accounts/:accountId/posts/:postId')
  getPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('accountId') accountId: string,
    @Param('postId') postId: string,
  ): Promise<InstagramPost> {
    return this.instagram.getPost(user.id, organizationId, accountId, postId);
  }

  /** Starts the direct Meta connection for one account. Separate from `connect` above, which is
   * Zernio's own OAuth: an account needs both - Zernio to run automations, Meta to list posts
   * without waiting hours for Zernio's sync. */
  @Post('accounts/:accountId/meta/connect')
  createMetaConnectUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('accountId') accountId: string,
  ): Promise<{ authUrl: string }> {
    return this.instagram.createMetaConnectUrl(user.id, organizationId, accountId);
  }

  /** Meta redirects the browser here with `code` and `state`. The state is signed and carries
   * the organization/account/user that started the flow - nothing in the query string is
   * trusted on its own. */
  @Post('meta/callback')
  handleMetaCallback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ): Promise<MetaConnectionSummary> {
    return this.instagram.handleMetaCallback(user.id, organizationId, body);
  }

  @Get('accounts/:accountId/meta')
  getMetaConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('accountId') accountId: string,
  ): Promise<MetaConnectionSummary | null> {
    return this.instagram.getMetaConnection(user.id, organizationId, accountId);
  }

  /** 204, not the default 200. A `Promise<void>` handler otherwise answers 200 with a
   * zero-length body, and `apps/web`'s `callApi` only skips JSON parsing on a 204 - so the
   * disconnect succeeded server-side and then blew up in the caller with "Unexpected end of JSON
   * input", surfacing to the user as a failure. Same convention as `removeMembership`. */
  @Delete('accounts/:accountId/meta')
  @HttpCode(204)
  disconnectMeta(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('accountId') accountId: string,
  ): Promise<void> {
    return this.instagram.disconnectMeta(user.id, organizationId, accountId);
  }
}
