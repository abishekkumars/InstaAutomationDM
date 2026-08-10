import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.interface';

// Only valid on a route protected by SessionGuard, which is what populates request.user.
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new Error('@CurrentUser() used on a route without SessionGuard.');
    }
    return request.user;
  },
);
