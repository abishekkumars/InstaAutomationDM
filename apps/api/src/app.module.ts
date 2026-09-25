import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { InstagramModule } from './instagram/instagram.module';
import { AutomationsModule } from './automations/automations.module';
import { AutomationTemplatesModule } from './automation-templates/automation-templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    AdminModule,
    HealthModule,
    OrganizationsModule,
    InstagramModule,
    AutomationsModule,
    AutomationTemplatesModule,
  ],
})
export class AppModule {}
