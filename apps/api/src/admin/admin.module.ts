import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstagramModule } from '../instagram/instagram.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// AuthModule is imported for SessionGuard + AdminGuard, matching OrganizationsModule's pattern.
//
// InstagramModule is imported for its INSTAGRAM_PROVIDER binding only, which deleting an
// organization needs to disconnect its Zernio accounts and delete its profile. It does NOT
// widen what an administrator can see: ADR 0007's rule that admin status grants no tenant data
// access still holds, and nothing here reads an organization's posts or automations.
@Module({
  imports: [AuthModule, InstagramModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
