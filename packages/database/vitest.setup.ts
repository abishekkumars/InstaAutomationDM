import { config } from 'dotenv';
import { resolve } from 'node:path';
import { useTestDatabase } from './dev/test-database.mjs';

// Tests run with cwd = packages/database (pnpm sets this per-package), but every other
// env var in this repo lives in one root .env - load that instead of expecting a
// second copy here. Silently does nothing if the file doesn't exist (e.g. in an
// environment, like CI, that sets DATABASE_URL directly).
config({ path: resolve(__dirname, '../../.env') });

// These tests delete every row in beforeEach. Swap DATABASE_URL for the separate test database
// before any PrismaClient exists, and refuse to run against anything not named `*_test` - see
// dev/test-database.mjs and docs/TESTING.md.
useTestDatabase();
