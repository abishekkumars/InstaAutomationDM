import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import {
  AutomationTemplatesService,
  type AutomationTemplateSummary,
} from './automation-templates.service';

/** Organization-wide automation templates (Phase 19). Org-scoped like the automation edit/delete
 * routes: a template belongs to the organization, not to an account or a post. */
@Controller('organizations/:organizationId/automation-templates')
@UseGuards(SessionGuard)
export class AutomationTemplatesController {
  constructor(private readonly templates: AutomationTemplatesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
  ): Promise<AutomationTemplateSummary[]> {
    return this.templates.list(user.id, organizationId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ): Promise<AutomationTemplateSummary> {
    return this.templates.create(user.id, organizationId, body);
  }

  @Put(':templateId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('templateId') templateId: string,
    @Body() body: unknown,
  ): Promise<AutomationTemplateSummary> {
    return this.templates.update(user.id, organizationId, templateId, body);
  }

  @Post(':templateId/default')
  @HttpCode(200)
  setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('templateId') templateId: string,
  ): Promise<AutomationTemplateSummary> {
    return this.templates.setDefault(user.id, organizationId, templateId);
  }

  @Post(':templateId/clone')
  clone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('templateId') templateId: string,
  ): Promise<AutomationTemplateSummary> {
    return this.templates.clone(user.id, organizationId, templateId);
  }

  @Delete(':templateId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId') organizationId: string,
    @Param('templateId') templateId: string,
  ): Promise<void> {
    return this.templates.remove(user.id, organizationId, templateId);
  }
}
