import type { AuthenticatedUser } from '../../auth/authenticated-user.interface';

// Adding this `import` makes TS treat the file as a module, which stops a bare
// `declare namespace Express` from merging into the global Express types `@types/express`
// already declares - it must be wrapped in `declare global` once the file imports anything.
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: AuthenticatedUser;
    }
  }
}
