import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS's DI resolves constructor parameter types via `emitDecoratorMetadata` - Vitest's
// default esbuild-based transform doesn't emit that, so every constructor-injected provider
// resolves to `undefined` without this. This is NestJS's own documented fix for Vitest
// (docs.nestjs.com/recipes/swc#vitest), not a workaround specific to this repo.
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 15000,
    // Every e2e test file here resets the whole database in beforeEach and hits the same
    // real local Postgres (docs/ADR/0003-local-postgresql-strategy.md) - Vitest's default
    // file-level parallelism let two files' resets/writes race each other once there was a
    // second e2e file (Phase 8's instagram.e2e.test.ts), causing spurious FK/unique-
    // constraint failures in unrelated tests. Serializing file execution is the correct fix
    // for a shared-database integration suite, not a workaround.
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
