import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import { InstagramService, type InstagramAccountSummary } from './instagram.service';

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
  ): Promise<{ authUrl: string }> {
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
}
