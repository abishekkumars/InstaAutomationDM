import type { DefaultSession } from 'next-auth';
import type { SessionWindowFields } from '@automationdm/shared';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }
}

// The per-device session window (packages/shared/src/session-lifetime.ts): whether the session
// was started on a phone, and when it goes idle. Server-side only - the JWT is an encrypted
// cookie, and the `session` callback never copies these into what the browser can read.
declare module 'next-auth/jwt' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface JWT extends SessionWindowFields {}
}
