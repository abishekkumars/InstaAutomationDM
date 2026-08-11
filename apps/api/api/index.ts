// Vercel serverless entrypoint for apps/api.
//
// This exists *alongside* src/main.ts, not instead of it: main.ts is still the real entry
// for local development (`nest start --watch`) and for any long-running host. The difference
// is who owns the socket. main.ts calls app.listen(PORT) and keeps a process alive; on Vercel
// the platform owns the socket and hands us one (req, res) pair at a time, so this file calls
// app.init() instead and hands back the underlying Node request handler.
//
// Vercel's zero-config builder treats every file under this `api/` directory as a serverless
// function, compiling the TypeScript (and everything it imports from ../src) itself. It is
// deliberately outside tsconfig.json's `rootDir: "src"` so `nest build` still emits a clean
// dist/main.js - tsconfig.serverless.json is what typechecks this file locally, so a mistake
// here fails on this machine rather than at deploy time.
import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { requestIdMiddleware } from '../src/common/middleware/request-id.middleware';

type NodeRequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

// Cache the *promise*, not the resolved handler. Two requests can hit a cold instance
// concurrently; caching the resolved value would let both start their own bootstrap (and so
// build two Nest containers, two Prisma pools) before either finished. Caching the promise
// means the second caller awaits the first one's work.
let cachedApp: Promise<NodeRequestHandler> | undefined;

async function bootstrap(): Promise<NodeRequestHandler> {
  const app = await NestFactory.create(AppModule);

  // Same wiring as src/main.ts, minus two things that are wrong in a serverless context:
  //  - app.listen(): Vercel owns the port; calling it would hang the invocation.
  //  - app.enableShutdownHooks(): registers process signal handlers, and a warm instance
  //    would accumulate a set per bootstrap with no shutdown signal ever arriving.
  app.setGlobalPrefix('api');
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  return app.getHttpAdapter().getInstance() as NodeRequestHandler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cachedApp ??= bootstrap();
  const app = await cachedApp;
  app(req, res);
}
