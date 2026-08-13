# ADR 0006: Response caching in apps/web, and what "fresh" now means

## Status
Accepted.

## Context

After Phase 10.3 the dashboard was measurably slow — the user's report was "every API call
taking 5 to 8 seconds". Two infrastructure causes were found and fixed before this ADR: the
Vercel functions and the Supabase database were in different regions (functions in `iad1`,
database in Sydney), and moving both to Mumbai (`bom1` / `ap-south-1`) removed most of it. What
remained was "faster but still a bit laggy", and the open question was whether Redis would fix
the rest.

Every layer was measured rather than guessed at, on 2026-08-12, against the live deployments:

| Layer | Measured | Notes |
|---|---|---|
| Supabase query | ~20 ms | `/api/ready` (SELECT 1) ≈ `/api/health` (no DB). Noise. |
| Vercel function, warm | ~0.19 s | both apps in `bom1` |
| Vercel function, **cold** | **~1.76 s** | at <1,000 calls/month, instances are usually cold |
| Zernio `GET /comment-automations` | **0.43–0.94 s** | 33-byte response — pure latency, not payload |
| Zernio `GET /posts?limit=500` | **0.66–1.73 s** | 169 KB |
| Web tier alone | ~0.19–0.30 s | a page making no API calls |

**The database was not a factor at all.** The remaining latency was external Zernio calls plus a
render that streamed nothing, so the browser saw a blank page until the slowest call finished.
On the dashboard that was ~1.3–2.5 s of blank page; `/instagram/posts/[postId]` ran three fully
sequential waves and reached ~4.4 s when it fell through to `reconcileFromZernio`.

Four structural amplifiers were found in the code itself:

- `apps/web/src/lib/api.ts` set `cache: 'no-store'` **after** `...init`, so no caller could ever
  opt into caching. Nothing in the app was cached, and no caller could make it so.
- No `error.tsx` and no `<Suspense>` around any data fetch, so nothing streamed and TTFB equalled
  the sum of every wave.
- `await auth()` ran once per `callApi` — four JWE decrypts on one dashboard render.
- The post detail page awaited its post and its automations sequentially, purely because each
  wanted its own `try`/`catch`.

## Decision

**Cache read responses in `apps/web`, keyed explicitly, invalidated by tag, with a 60-second
TTL.** `callApiCached` (`apps/web/src/lib/api.ts`) wraps `unstable_cache` from `next/cache`,
which is backed by the durable Vercel Data Cache. `callApi` is unchanged and remains the
uncached path for mutations and for reads that must not be stale.

Three constraints shaped the implementation, all verified against the installed Next 16.3.0
rather than assumed:

1. **Caching cannot live on the `fetch` inside `callApi`.** The fetch Data Cache key includes
   request headers, and `packages/shared/src/internal-service-token.ts` mints a fresh JWT per
   call (`expiresIn: 60`), so `iat`/`exp` differ every time, the `Authorization` header differs
   every time, and the entry would never be hit. Caching therefore sits one level up, where the
   key is explicit.
2. **The cached function must not read cookies.** `currentCaller()` runs outside the boundary and
   the caller is passed in as an argument — which also scopes entries per user, so one user can
   never read another's cached response.
3. **The service token is minted inside the cached function.** Minting it outside would bake a
   60-second credential into an entry that outlives it, and a later cache hit would hand
   `apps/api` an expired token.

**Tags live in one registry**, `apps/web/src/lib/cache-tags.ts`: `org:{id}:automations`,
`org:{id}:accounts`, `org:{id}:members`, `acct:{id}:posts`. Reads and invalidations must not be
allowed to drift — a typo in either half fails silently, and in opposite directions (a stale page
that never refreshes, or a cache that never hits).

**Invalidation uses `revalidateTag(tag, { expire: 0 })`, not `updateTag`.** `unstable_cache`'s own
documentation names `revalidateTag`/`revalidatePath` as its invalidation path; `updateTag` is
documented for `fetch`-tagged and `'use cache'` entries, which these are not. `{ expire: 0 }`
rather than the recommended `'max'` profile because `'max'` is stale-while-revalidate, which would
serve the pre-edit values once more — after an explicit save, delete, or Sync press the user must
see their own change immediately.

**Degraded responses are never cached.** `AutomationsService.listForOrganization` deliberately
answers `200` with `stats: null` when Zernio is unreachable, rather than failing the page (Phase
10.3). Storing that would pin "stats unavailable" for the whole TTL, turning a one-second Zernio
blip into a minute of visibly broken numbers. `callApiCached` takes an `isDegraded` predicate and
returns such a payload to the caller without writing it, implemented by throwing from inside the
cached function — the only way to say "return this but do not store it", since `unstable_cache`
caches whatever resolves and offers no such option.

**Cached data is labelled as cached.** The dashboard header shows how old the figures are next to
the Sync button, so a user who has just changed something in Zernio's own dashboard can tell a
stale snapshot from a real result.

**Zernio requests are bounded.** `ZernioInstagramProvider.request` had no timeout; one slow
upstream call could hold a serverless invocation open indefinitely. It now uses
`AbortSignal.timeout(10_000)` and converts a `TimeoutError` into a `ZernioApiError` with status
504, so existing status-branching (404/409) keeps working unchanged.

## Consequences

- **Freshness becomes a user-visible contract, not an implementation detail.** Dashboard figures
  may be up to 60 seconds old, and longer while a stale entry revalidates in the background. This
  is the reason this change needed an ADR at all.
- **Sync becomes architecturally load-bearing.** Before this change every read was `no-store`,
  there was nothing to invalidate, and `syncAutomationsAction`'s `revalidatePath('/')` was a no-op
  dressed up as a refresh. It is now the user's only means of forcing fresh data, so it must keep
  expiring every tag a change can affect.
- **Every new cached read must register its tag in `lib/cache-tags.ts`, and every mutating server
  action must invalidate the tags it affects.** Skipping the second half fails silently: the write
  succeeds, the page re-renders, and the user still sees old numbers.
- **`syncAutomationsAction` changed signature** from `()` to `(formData: FormData)` — it needs the
  organization id to build tags — and `SyncButton` now requires an `organizationId` prop.
- Total Zernio call volume per dashboard load drops on a cache hit, which matters against the
  <1,000 calls/month budget this project sizes itself against.
- ADR 0005's "no Redis unless a concrete requirement appears" stands, reaffirmed below rather than
  overturned.

## Alternatives considered

**Redis.** Rejected. The only thing worth caching is Zernio responses (0.4–1.7 s), and Redis would
indeed cache them — but Vercel's Data Cache already does, at zero setup, and it survives cold
starts. Redis would add a paid service, its own network hop, and a connection per cold serverless
instance — the same connection-storm problem just fixed for Postgres. ADR 0005 names Redis as "not
introduced unless a concrete requirement appears later" and requires a new ADR to reintroduce it;
there is no such requirement, because caching is available for free. Recorded here as
considered-and-rejected, with the numbers above, so the question does not have to be re-litigated
from scratch.

**An in-memory cache inside `apps/api`.** Rejected. At roughly 1.4 requests/hour instances are
almost always cold, so it would rarely hit, and the Sync button in `apps/web` could never
invalidate a `Map` living in a different serverless instance.

**`'use cache'` instead of `unstable_cache`.** Rejected. Next's own documentation states that with
the default cache handler it is in-memory per instance and that entries "typically don't persist
across requests" on serverless — so it would not help here. `unstable_cache` is documented as
"replaced by `use cache`" but is present and functional; migrating properly would mean
`cacheComponents: true` plus `'use cache: remote'`, which makes `next build` error on every
uncached runtime read starting with `layout.tsx`. That is a separate, larger change.

**Denormalizing post captions and thumbnails into Postgres.** Rejected, after initially being
proposed as the single biggest win — the framing was wrong on two counts. The saving is
0.23–0.79 s, not the ~1.7 s first claimed, because the stats call runs *in parallel* with the
posts call, so removing the posts call only shaves the slower of two parallel legs down to the
faster one. More importantly, Instagram/Zernio thumbnail URLs are signed and expiring, so a stored
URL rots into a broken image — a worse failure mode than a slow one. Caching gets the same latency
win for the common case with no staleness risk. This would also contradict ADR 0005 and
`schema.prisma`, both of which state Instagram post content is deliberately never duplicated into
Postgres; revisiting it would need its own ADR and a thumbnail-refresh path on Sync.

**An aggregate `GET /api/me/dashboard` endpoint, and moving the organization id into the Auth.js
JWT.** Deferred, not rejected. Both would remove the `/api/organizations` round trip that still
blocks above every Suspense boundary (~0.2 s). Neither is worth building until the measurements
after this change show they are still needed.
