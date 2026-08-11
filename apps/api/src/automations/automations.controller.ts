import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import { AutomationsService, type AutomationSummary } from './automations.service';

@Controller('organizations/:organizationId/instagram/accounts/:accountId/posts/:postId/automations')
@UseGuards(SessionGuard)
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  listForPost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('accountId') accountId: string,
    @Param('postId') postId: string,
  ): Promise<AutomationSummary[]> {
    return this.automations.listForPost(user.id, organizationId, accountId, postId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('accountId') accountId: string,
    @Param('postId') postId: string,
    @Body() body: unknown,
  ): Promise<AutomationSummary> {
    return this.automations.create(user.id, organizationId, accountId, postId, body);
  }
}
