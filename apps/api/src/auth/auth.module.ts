import { Module } from '@nestjs/common';
import { SessionGuard } from './session.guard';

@Module({
  providers: [SessionGuard],
  exports: [SessionGuard],
})
export class AuthModule {}
