import { defineConfig, devices } from '@playwright/test';

/** Browser tests for the device-specific views (Phase 18.6, docs/ADR/0010-device-specific-views.md).
 *
 * They run against the already-running local dev stack (scripts/dev.ps1) rather than starting
 * one: this repo's servers must be launched through the project-local runtime, and a second copy
 * would fight the first for ports 3000/4000.
 *
 * `channel: 'msedge'` drives the Edge that ships with Windows, so no Playwright browser download
 * is needed and nothing is installed outside the repo. Set E2E_BROWSER_CHANNEL=chrome to use
 * Chrome instead.
 *
 * One worker: every test signs in as the same seeded user and reads the same seeded rows. */
const channel = process.env.E2E_BROWSER_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // Android Chrome user agent: lib/device.ts reports a phone, so the mobile view renders.
      name: 'mobile',
      testMatch: /mobile\..*spec\.ts/,
      use: { ...devices['Pixel 7'], channel },
    },
    {
      name: 'desktop',
      testMatch: /desktop\..*spec\.ts/,
      use: { ...devices['Desktop Edge'], channel },
    },
  ],
});
