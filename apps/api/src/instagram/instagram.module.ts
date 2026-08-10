import { Module } from '@nestjs/common';
import { ZernioInstagramProvider } from '@automationdm/zernio';
import { AuthModule } from '../auth/auth.module';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { INSTAGRAM_PROVIDER } from './instagram-provider.token';

@Module({
  imports: [AuthModule],
  controllers: [InstagramController],
  providers: [
    InstagramService,
    {
      provide: INSTAGRAM_PROVIDER,
      // Reads ZERNIO_API_KEY lazily inside ZernioInstagramProvider's methods, not here - a
      // missing key must not stop apps/api from starting (same resilience rule as
      // API_INTERNAL_SECRET in auth.module.ts) since /api/health and /api/ready don't touch
      // Zernio at all.
      useFactory: () => new ZernioInstagramProvider(process.env.ZERNIO_API_KEY ?? ''),
    },
  ],
})
export class InstagramModule {}
