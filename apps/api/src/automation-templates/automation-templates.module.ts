import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AutomationTemplatesController } from './automation-templates.controller';
import { AutomationTemplatesService } from './automation-templates.service';

// No InstagramModule import: templates never reach Zernio (Phase 19).
@Module({
  imports: [AuthModule],
  controllers: [AutomationTemplatesController],
  providers: [AutomationTemplatesService],
})
export class AutomationTemplatesModule {}
