import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

/** Requires the caller to hold the global ADMIN role (Phase 15.2, requirement 19).
 *
 * Always used *after* `SessionGuard`, which is what populates `request.user` - and, crucially,
 * what resolves `role` from the database rather than from the bearer token. This guard makes no
 * decision of its own about what the caller's role is; it only acts on what SessionGuard
 * already established. Declare them in order: `@UseGuards(SessionGuard, AdminGuard)`.
 *
 * `403`, not the `404` used for tenant-owned resources. Those return 404 so a non-member cannot
 * tell "doesn't exist" from "exists but isn't yours" - but the existence of `/api/admin/*` is
 * not a secret worth protecting, and a 404 there would just make a legitimate
 * administrator's misconfiguration look like a broken route.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.user) {
      // A wiring mistake, not a client error: this guard cannot run usefully on its own.
      // Thrown rather than returning false so it surfaces as a 500 during development
      // instead of masquerading as a legitimate authorization failure in production.
      throw new Error('AdminGuard used on a route without SessionGuard.');
    }

    if (request.user.role !== 'ADMIN') {
      throw new ForbiddenException('Administrator access is required.');
    }

    return true;
  }
}
