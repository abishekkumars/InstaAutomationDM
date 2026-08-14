import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user.interface';
import { SessionGuard } from './session.guard';

/** The caller's own identity, as apps/api resolved it (Phase 15.1).
 *
 * Exists for two reasons. apps/web needs to know whether to render the Administration nav item
 * (Phase 15.2), and asking apps/api is the only correct way to find that out - apps/web holds a
 * session, but the session says nothing about the caller's role, by design (see
 * AuthenticatedUser.role). And it gives `SessionGuard`'s role resolution a directly testable
 * surface, so "the role comes from the database, not from the token" is asserted rather than
 * assumed.
 *
 * Returns only what the guard already resolved - no extra query, and nothing about the user
 * beyond id/email/role (never `passwordHash`, per docs/DATABASE.md's `User` notes). */
@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
