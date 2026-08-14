import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyInternalServiceToken } from '@automationdm/shared';
import type { InternalServiceTokenPayload } from '@automationdm/shared';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';

// Verifies the apps/web -> apps/api internal service token (see
// packages/shared/src/internal-service-token.ts and docs/ARCHITECTURE.md's "Session
// verification (Phase 6)" section) and attaches the caller's identity to the request.
// Every tenant-scoped query resolves organizationId from this identity server-side -
// never from a client-supplied path/body value.
//
// As of Phase 15.1 it also resolves the caller's global role, and does so by reading the
// `users` row rather than trusting anything in the token - see AuthenticatedUser.role.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.header('authorization');
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    const secret = process.env.API_INTERNAL_SECRET;
    if (!secret) {
      // Deliberately not added to apps/api/src/config/env.validation.ts's strict startup
      // check: that would abort the whole process (including the unauthenticated
      // /api/health, /api/ready endpoints) over a config value only auth-guarded routes
      // need. Failing loudly here, at the point of use, is enough.
      throw new Error('API_INTERNAL_SECRET is not configured.');
    }

    // Only the verification is wrapped. The database read below must NOT be inside this
    // catch: a Postgres outage would otherwise be reported to the caller as "invalid or
    // expired bearer token", sending them to re-authenticate over a fault that has nothing
    // to do with their credentials, and hiding the real error from the logs.
    let payload: InternalServiceTokenPayload;
    try {
      payload = verifyInternalServiceToken(token, secret);
    } catch {
      throw new UnauthorizedException('Invalid or expired bearer token.');
    }

    // The token proves *who* the caller is; the database decides *what they may do*. `email`
    // is re-read here too rather than taken from the token, so both halves of the identity
    // come from one authority and cannot disagree after an email change.
    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      // A structurally valid token for a user who no longer exists (deleted between mint and
      // use). 401, not 500 - the credential is genuinely no longer good.
      throw new UnauthorizedException('Invalid or expired bearer token.');
    }

    request.user = { id: user.id, email: user.email, role: user.role };
    return true;
  }
}
