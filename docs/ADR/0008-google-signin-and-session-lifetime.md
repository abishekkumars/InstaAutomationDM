# ADR 0008 — Google sign-in alongside credentials, and a rolling session lifetime

- **Status**: Accepted
- **Date**: 2026-08-14
- **Phase**: 15.5 (Google sign-in) and 15.6 (session lifetime + expiry notice)
- **Extends**: `docs/ADR/0004-authentication-provider.md`, which chose Auth.js with a
  `Credentials`-only provider. That decision stands; this adds a second provider beside it.

## Context

ADR 0004 chose Auth.js with `Credentials` (email + password) and explicitly deferred OAuth,
because wiring one "would require external app registration + credentials from the user before
this phase could proceed." That blocker is now accepted rather than avoided: a requirement asks
for Google sign-in and sign-up, and the user has agreed to create the OAuth client.

Separately, the app had no session timeout at all. A session lasted until the cookie was
cleared, and there was no signal to a user sitting on a page when it did end — the first they
would know was a server action failing, typically after typing something they then lost.

## Decision

### 1. Google as an additional provider, not a replacement

Email/password remains. Both providers write to the same `users` table, and an account can end
up reachable by both.

**Accounts are linked by email address**, which is the only identifier both providers share.
Three rules make that safe:

- An **unverified** Google email is refused outright. Linking by email means accepting one
  would let someone sign in as an existing user by registering a Google account claiming that
  address. Google reports `email_verified`; this decision is simply not to ignore it.
- Linking **never overwrites** an existing account's `passwordHash` or its `authProvider`. An
  account created by email/password keeps its password and keeps working both ways; only an
  account with no provider recorded adopts `google`.
- The `ADMIN_EMAIL` bootstrap (ADR 0007) applies on the Google path too, so which provider
  someone signs in with never changes what they are allowed to do.

### 2. The session carries this project's `User.id`, never Google's subject id

Auth.js hands the `signIn` callback Google's own `sub`, and the `jwt` callback copies
`user.id` into `token.sub` — which is what `apps/web` sends to `apps/api` and what
`SessionGuard` looks up. The callback therefore overwrites `user.id` with the `users` row's
primary key before the token is minted.

This is called out as a decision rather than an implementation detail because getting it wrong
produces a *successful* sign-in in which every subsequent API call 401s — a failure that looks
like a broken backend rather than a broken identity mapping.

### 3. A partially configured provider must not break authentication

The Google provider is registered only when **both** `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are present, and the button is hidden on the same condition.

Auth.js throws at *import time* if a provider is registered without its credentials. Since
`src/auth.ts` is imported by every authenticated path, a half-configured Google provider would
take down email/password sign-in as well. Failing closed means an unconfigured environment has
no Google button; failing open would mean it has no authentication.

The visible cost is that a missing environment variable presents as "the feature was not
built." That is accepted, and `.env.example` documents both variables and the exact redirect
URI to register.

### 4. A rolling 30-minute idle session, with an explicit expiry notice

`session.maxAge` is 30 minutes and `updateAge` is 5 minutes. With the JWT strategy, `maxAge` is
the token's lifetime and Auth.js re-issues the cookie as the session is used, so this behaves
as *idle* timeout: continuous work is never interrupted, an unattended machine is signed out.

`updateAge` is deliberately neither 0 (which rewrites the cookie on every request and makes
every response uncacheable) nor the 24-hour default (useless against a 30-minute token, which
would expire long before it was ever refreshed).

`SessionExpiryWatcher` polls Auth.js's own `/api/auth/session` rather than running a countdown
started at page load. A timer would be wrong in both directions: the session extends itself as
the user works, and it can also end early if the cookie is cleared or `AUTH_SECRET` is rotated.
Only the server knows.

The watcher treats **only a successful response carrying no user** as expiry. A 5xx or a
dropped connection is ignored, because a spurious "you have been signed out" that clears itself
on the next poll teaches people to dismiss the notice that matters.

## Consequences

**Good**

- Sign-in no longer depends on a password the user has to choose, store, and remember for a
  tool they may use rarely.
- An unattended session now ends, and a user is told about it before losing work rather than
  after.
- Neither change touches authorization: roles are still resolved from the database on every
  request (ADR 0007), so how someone authenticated has no bearing on what they may do.

**Bad / accepted costs**

- Google sign-in cannot work until someone creates an OAuth client in Google Cloud Console and
  supplies two secrets. Until then the feature is invisible, and "invisible" is
  indistinguishable from "not implemented" without reading `.env.example`.
- A 30-minute idle timeout will occasionally sign out someone who stepped away mid-task. That
  is the intent, but it is a real cost, and the number is a guess that can be revisited — it is
  one constant in `auth.config.ts`.
- The watcher adds one lightweight request per minute per open tab. Negligible at this
  project's scale (a handful of users); it would need rethinking at a scale this project does
  not target.

## Alternatives rejected

- **Replacing credentials with Google entirely.** Would lock out anyone without a Google
  account and make local development depend on an external service. ADR 0004's reasoning about
  self-hosting still applies.
- **Linking accounts by Google's `sub` only, never by email.** Safer against email spoofing,
  but it would give a user who already had an email/password account a *second*, separate
  account on their first Google sign-in — with none of their organizations. Requiring
  `email_verified` addresses the risk without that outcome.
- **An absolute (non-rolling) session lifetime.** Simpler to reason about, but it signs people
  out mid-task at an arbitrary moment with no relationship to whether they were using the app.
- **Registering the Google provider unconditionally** and letting it fail loudly. It fails at
  import time, so "loudly" means the entire authentication layer, not just Google.
