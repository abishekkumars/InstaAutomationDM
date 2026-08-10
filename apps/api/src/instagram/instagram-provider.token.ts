// A TypeScript interface (InstagramProvider, packages/zernio) has no runtime representation,
// so NestJS DI needs an explicit token to bind an implementation to. Kept in its own file so
// instagram.module.ts (the only place that provides a real value for it) and any test
// (which overrides it with a fake, per docs/TESTING.md - never a live Zernio call) can both
// import just the token without pulling in the module itself.
export const INSTAGRAM_PROVIDER = Symbol('INSTAGRAM_PROVIDER');
