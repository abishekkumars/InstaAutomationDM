import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { useTestDatabase } from '../../packages/database/dev/test-database.mjs';

// Same pattern as packages/database/vitest.setup.ts - one root .env, not a second copy here.
config({ path: resolve(__dirname, '../../.env') });

// The e2e suites delete every row in beforeEach - run them against the separate test database,
// never the development one. See packages/database/dev/test-database.mjs and docs/TESTING.md.
useTestDatabase();
