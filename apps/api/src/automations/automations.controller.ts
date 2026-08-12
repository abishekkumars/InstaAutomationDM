import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import {
  AutomationsService,
  type AutomationListItem,
  type AutomationSummary,
} from './automations.service';

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

// Separate controller (rather than a second method on AutomationsController): the route has
// no accountId/postId segment - it lists across every account in the org, for the dashboard
// table - see AutomationsService.listForOrganization.
@Controller('organizations/:organizationId/automations')
@UseGuards(SessionGuard)
export class OrganizationAutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  listForOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
  ): Promise<AutomationListItem[]> {
    return this.automations.listForOrganization(user.id, organizationId);
  }

  // Edit/delete live on this org-scoped route rather than the post-scoped one above: an
  // automation's own id already identifies it uniquely, and both the dashboard table (which
  // has no post context) and the post detail page need to call them.
  @Patch(':automationId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('automationId') automationId: string,
    @Body() body: unknown,
  ): Promise<AutomationSummary> {
    return this.automations.update(user.id, organizationId, automationId, body);
  }

  @Delete(':automationId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('automationId') automationId: string,
  ): Promise<void> {
    return this.automations.remove(user.id, organizationId, automationId);
  }
}
