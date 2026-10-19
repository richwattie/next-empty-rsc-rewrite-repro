# Empty `_rsc` dropped from a middleware rewrite

Minimal reproduction: a Server Action that calls `redirect()` to a path that middleware rewrites to another Next server makes Next's internal redirect fetch loop until `redirect count exceeded`.

## Run it

```sh
npm install
npm run build

# terminal 1: the server /target is proxied to
npx next start -p 3124

# terminal 2: the server the browser talks to; it rewrites /target to :3124
REWRITE_ORIGIN=http://localhost:3124 npx next start -p 3123
```

Open <http://localhost:3123> and click the button, or run:

```sh
# The redirect fetch's own request, which loops:
curl -s -o /dev/null -D - -H 'RSC: 1' --max-redirs 0 'http://localhost:3123/target?_rsc'
# HTTP/1.1 307 Temporary Redirect
# location: /target?_rsc            <- the same URL
```

Terminal 2 logs, once per click:

```
failed to get redirect response [TypeError: fetch failed] {
  [cause]: Error: redirect count exceeded
```

The user still lands on `/target`, because Next falls back to a plain redirect. But the single-round-trip response is lost and the error is logged every time.

## Why

1. `redirect('/target')` in a Server Action makes Next fetch the target server-side (`createRedirectRenderResult`). It deletes `Next-Router-State-Tree` first. With no router headers left, the expected cache-busting hash is `''`, so it requests `/target?_rsc`.
2. The middleware adapter strips `_rsc` before the handler runs, and puts it back on a rewrite only when it is truthy (`packages/next/src/server/web/adapter.ts`):

   ```ts
   if (response && rewrite && isRSCRequest && rscHash) {
   ```

   `''` is falsy, so it is dropped and `:3124` receives `/target` with no `_rsc`.
3. `:3124` validates the hash, gets `null !== ''`, and answers `307 → /target?_rsc`. The fetch follows it back to `:3123`, step 2 drops the hash again, and the loop runs until undici gives up.

An internal rewrite on a single `next start` does **not** reproduce it, because that server validates against the original URL. Any setup where the rewrite's destination sees only the rewritten URL does: an external rewrite as here, or a deployment adapter that replaces the query with the rewrite's.

## Fix

```diff
- if (response && rewrite && isRSCRequest && rscHash) {
+ if (response && rewrite && isRSCRequest && rscHash !== null) {
```

This forwards a present hash, empty or not. An absent `_rsc` is still not added, so a bare RSC request is still redirected to its hashed URL and the cache-poisoning check is unchanged. Applied to `node_modules/next/dist/{,esm/}server/web/adapter.js` and rebuilt:

| request (`RSC: 1`) to `:3123`  | before          | after           |
| ------------------------------ | --------------- | --------------- |
| `/target?_rsc`                 | `307 → ?_rsc`   | `200`           |
| `/target` (no `_rsc`)          | `307 → ?_rsc`   | `307 → ?_rsc`   |
| Server Action → `redirect()`   | logs the error  | streams target  |

Next.js 16.3.8; the condition is unchanged on `16.5.0-canary.17`.
