import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { InstagramPost, ListPostsResult } from '@automationdm/zernio';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import {
  InstagramService,
  type ConnectResult,
  type InstagramAccountSummary,
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

  @Get('accounts/:accountId/posts/:postId')
  getPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('accountId') accountId: string,
    @Param('postId') postId: string,
  ): Promise<InstagramPost> {
    return this.instagram.getPost(user.id, organizationId, accountId, postId);
  }
}
