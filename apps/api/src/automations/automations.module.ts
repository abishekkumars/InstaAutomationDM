import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstagramModule } from '../instagram/instagram.module';
import { AutomationsController, OrganizationAutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';

@Module({
  imports: [AuthModule, InstagramModule],
  controllers: [AutomationsController, OrganizationAutomationsController],
  providers: [AutomationsService],
})
export class AutomationsModule {}
