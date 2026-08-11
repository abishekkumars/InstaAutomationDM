import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

// This project requires Node >= 20 (docs/DEVELOPMENT-SETUP.md - Next.js 16/NestJS 11 both
// need it, and packages/zernio relies on the global `fetch` Node only ships from 18
// onward). A direct `node`/IDE-run invocation can silently resolve to this machine's
// global Node 16 install instead of the project-local one scripts/*.ps1 use - when that
// happens, fail immediately with an actionable message instead of a much later, confusing
// "fetch is not defined" ReferenceError the first time a Zernio call runs.
function assertSupportedNodeVersion(): void {
  const majorVersion = Number(process.versions.node.split('.')[0]);
  if (majorVersion < 20) {
    throw new Error(
      `apps/api requires Node >= 20 (found ${process.version} at ${process.execPath}). ` +
        "This is the wrong Node runtime - use '.\\scripts\\dev.ps1' or " +
        "'.\\scripts\\pnpm.ps1 --filter @automationdm/api run dev', never a direct " +
        "'node'/IDE-run invocation. Run '.\\scripts\\doctor.ps1' to see what's resolving " +
        'and why. See docs/DEVELOPMENT-SETUP.md, "Enforcing the project-local Node runtime".',
    );
  }
}

async function bootstrap(): Promise<void> {
  assertSupportedNodeVersion();

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
}

bootstrap();
