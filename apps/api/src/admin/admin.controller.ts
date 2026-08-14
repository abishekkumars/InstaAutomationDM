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
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { SessionGuard } from '../auth/session.guard';
import {
  AdminService,
  type AdminOrganizationSummary,
  type AdminUserMembership,
  type AdminUserSummary,
} from './admin.service';

/** The Administration surface (Phase 15.2, requirement 16).
 *
 * Guard order matters and is not cosmetic: `SessionGuard` runs first and resolves the caller's
 * role from the database, then `AdminGuard` acts on it. Reversing them would have AdminGuard
 * read a `request.user` that nothing had populated yet.
 *
 * Requirement 19 in practice: the check lives here, on the route, in `apps/api`. `apps/web`
 * also hides the Administration nav item from non-admins (Phase 15.2b), but that is presentation
 * only - hiding a link is not access control, and every one of these routes rejects a
 * NORMAL_USER regardless of what the browser chose to render. */
@Controller('admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(): Promise<AdminUserSummary[]> {
    return this.admin.listUsers();
  }

  @Get('organizations')
  listOrganizations(): Promise<AdminOrganizationSummary[]> {
    return this.admin.listOrganizations();
  }

  @Post('organizations')
  createOrganization(@Body() body: unknown): Promise<AdminOrganizationSummary> {
    return this.admin.createOrganization(body);
  }

  @Post('users/:userId/memberships')
  addMembership(
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<AdminUserMembership> {
    return this.admin.addMembership(userId, body);
  }

  @Delete('users/:userId/memberships/:organizationId')
  @HttpCode(204)
  removeMembership(
    @Param('userId') userId: string,
    @Param('organizationId') organizationId: string,
  ): Promise<void> {
    return this.admin.removeMembership(userId, organizationId);
  }

  @Patch('users/:userId/role')
  updateUserRole(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<AdminUserSummary> {
    // The caller is passed through only so the last-administrator error can say "you" when it
    // is the caller demoting themselves - it is not part of the authorization decision, which
    // AdminGuard already made.
    return this.admin.updateUserRole(caller.id, userId, body);
  }
}
