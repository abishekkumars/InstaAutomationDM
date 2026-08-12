import { cache } from 'react';
import { auth } from '@/auth';

/** Per-request-memoized `auth()`.
 *
 * `auth()` decrypts the Auth.js JWE session cookie on every call - CPU work, no database query
 * (the session strategy is JWT with no Prisma adapter, see docs/ADR/0004). A dashboard render
 * used to call it five times: once in the root layout and once per `callApi`. React's `cache()`
 * dedupes those into one decrypt per request while keeping the value request-scoped, so no
 * session ever leaks between users.
 *
 * Use this everywhere instead of importing `auth` directly.
 */
export const getSession = cache(auth);
