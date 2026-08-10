import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Same pattern as packages/database/vitest.setup.ts - one root .env, not a second copy here.
config({ path: resolve(__dirname, '../../.env') });
