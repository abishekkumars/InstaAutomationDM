import { PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient across hot reloads in development (tsx/ts-node watch mode
// re-executes this module on every reload; without this, each reload would open a new
// pool of connections to Postgres that never gets closed, and the connection count grows
// unbounded until Postgres refuses new ones). In production there's exactly one process
// start, so this is equivalent to a plain singleton there.
//
// Never logs query parameters or the connection string - `log` below is intentionally
// limited to warnings/errors, never `'query'` (which would include bound parameter values).
declare global {
  var __automationdmPrismaClient: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalThis.__automationdmPrismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__automationdmPrismaClient = prisma;
}

// Graceful shutdown hook for callers that manage their own process lifecycle (e.g.
// apps/worker). apps/api instead wires this through NestJS's own `OnModuleDestroy` +
// `app.enableShutdownHooks()` - see apps/api/src/database/prisma.service.ts.
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
