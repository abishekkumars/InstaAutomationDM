import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import {
  OrganizationsService,
  type OrganizationMemberSummary,
  type OrganizationSummary,
} from './organizations.service';

// Read-only as of Phase 15.3. `POST /organizations` used to let any authenticated user create an
// organization and make themselves its OWNER - which was correct while `/onboarding` was the way
// in, and became a hole the moment membership became the access gate (requirement 16): a
// NORMAL_USER waiting to be admitted could simply admit themselves, and nothing about the
// Administration screen would have stopped them.
//
// Creating organizations now lives at `POST /api/admin/organizations`, behind AdminGuard. See
// docs/ADR/0007-global-user-roles-and-administration.md.
@Controller('organizations')
@UseGuards(SessionGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

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
