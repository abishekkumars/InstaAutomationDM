import { config } from 'dotenv';
import { resolve } from 'node:path';

// Tests run with cwd = packages/database (pnpm sets this per-package), but every other
// env var in this repo lives in one root .env - load that instead of expecting a
// second copy here. Silently does nothing if the file doesn't exist (e.g. in an
// environment, like CI, that sets DATABASE_URL directly).
config({ path: resolve(__dirname, '../../.env') });
