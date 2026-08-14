import { Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { MeController } from './me.controller';
import { SessionGuard } from './session.guard';

// SessionGuard injects PrismaService (Phase 15.1, to resolve the caller's role). No import of
// DatabaseModule is needed here because it is @Global() - see database/database.module.ts.
@Module({
  controllers: [MeController],
  providers: [SessionGuard, AdminGuard],
  exports: [SessionGuard, AdminGuard],
})
export class AuthModule {}
