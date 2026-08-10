import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyInternalServiceToken } from '@automationdm/shared';
import type { Request } from 'express';

// Verifies the apps/web -> apps/api internal service token (see
// packages/shared/src/internal-service-token.ts and docs/ARCHITECTURE.md's "Session
// verification (Phase 6)" section) and attaches the caller's identity to the request.
// Every tenant-scoped query resolves organizationId from this identity server-side -
// never from a client-supplied path/body value.
@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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

    try {
      const payload = verifyInternalServiceToken(token, secret);
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired bearer token.');
    }
  }
}
