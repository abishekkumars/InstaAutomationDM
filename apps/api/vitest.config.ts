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
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
