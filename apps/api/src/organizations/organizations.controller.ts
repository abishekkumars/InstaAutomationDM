import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import {
  OrganizationsService,
  type OrganizationMemberSummary,
  type OrganizationSummary,
} from './organizations.service';

@Controller('organizations')
@UseGuards(SessionGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<OrganizationSummary> {
    return this.organizations.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<OrganizationSummary[]> {
    return this.organizations.listForUser(user.id);
  }

  @Get(':id/members')
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') organizationId: string,
  ): Promise<OrganizationMemberSummary[]> {
    return this.organizations.listMembers(user.id, organizationId);
  }
}
