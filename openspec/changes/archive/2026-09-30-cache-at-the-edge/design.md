## Context

Cloudflare already proxies carlnotes.com. Every response has `server: cloudflare` and a `cf-ray`, and the zone caches the way it does by default: only paths with a static file extension. Everything else reaches the one Bun process, which renders the pages, builds the feeds, streams avatars and favicons from storage, and gzips each text response with Hono's `compress()`.

Measured in production on 2026-09-29:

- Pages, the signed-out feed, and avatars return `cf-cache-status: DYNAMIC`.
- The signed-out feed is 641 KB of JSON, 203 KB gzipped. Gzip costs 6 to 26 ms of the one thread per response. Cloudflare already re-encodes HTML to brotli for a browser that accepts it.
- A preview card is `immutable` and cached by its `.png` extension, at a url that never changes.
- `TRUSTED_PROXIES` equals Cloudflare's 22 published ranges. Better Auth reads them as ranges. The limiter reads them as a hop count of 22, finds a two-hop chain too short, and puts every anonymous MCP caller in one shared bucket.

These headers already suit an edge and stay as they are: hashed assets under `/assets/` and `/docs/_astro/` are `public, max-age=31536000, immutable`, favicons are a month, the sitemap is an hour, and `llms.txt` is fifteen minutes. The docs pages and the ui's unhashed public files stay `no-cache`, which Cloudflare revalidates on every request.

## Goals / Non-Goals

**Goals:**

- The edge serves the public pages, the blog and release pages, the signed-out feed, avatars, preview cards, favicons, the discovery files, and the client bundle, each for as long as the origin's headers allow.
- A signed-in visitor never receives a copy cached for someone else.
- A stored image's url changes exactly when the image does, so the image can be cached for a year.
- Better Auth and the rate limiter resolve the same client address for every request.
- Compression happens in one place.
- Every Cloudflare setting is written down exactly, since none of it lives in the repo.

**Non-Goals:**

- Caching any response for a signed-in visitor, or any api route other than the signed-out feed, avatars, favicons, and cards. The topic page's data route and `/api/public-topics` stay uncached.
- Purging the edge when data changes. A changed or newly private topic leaves the edge within two minutes.
- Ignoring tracking parameters such as `fbclid` in the cache key. Each distinct query string is its own entry. Dropping them first needs a check that no page reads its query string while it renders on the server.
- Moving the limiter to a shared store. It stays in memory, one per process.
- Keeping the previous build's assets servable from the origin.

## Decisions

### An avatar's version is its storage key id

The version comes from the same key the `ETag` already uses. An upload's key is `avatars/<userId>/<keyId>.<ext>`, with a fresh random `keyId` per upload, so the version is that `keyId`. A provider photo's version is the constant `oauth`. The initials have no version and no url. A team's version is its own key's `keyId`. One `toAvatarVersion` in `shared/avatars.ts` computes it, so the api and the ui always agree.

- A user payload gains `avatarVersion` beside `avatarSource`. Every query that selects `avatarSource` also selects `avatarKey` from the same `users` row.
- A team payload's `hasAvatar` becomes `avatarVersion`, null for a team with none. The boolean says nothing the version does not.
- `UserAvatar` and `TeamAvatar` take the version and request `/api/avatars/:userId?v=<version>` and `/api/team-avatars/:teamId?v=<version>`. A null version draws the initials without a request.
- `UserAvatar` draws the signed-in user's own avatar at the session's version. The session already includes `avatarSource` and `avatarKey`, and the upload flow already refreshes it, so the uploader's avatar changes everywhere on the page at once. A team upload reloads the team it changed. `useAvatarVersion` and `refreshAvatars` are removed.

The avatar routes compare `v` with the current version:

| Request | `Cache-Control` | `CDN-Cache-Control` |
|---|---|---|
| Stored image at the current version | `public, max-age=31536000, immutable` | `max-age=86400` |
| Stored image at an old version, or with none | `public, max-age=60` | none |
| Provider photo redirect, at any `v` | `public, max-age=3600` | none |

Deleting a team deletes its stored image, by its leader or with its only member's account, as closing an account already deletes the user's. A failed delete is logged and never blocks the deletion.

An old version gets the current image for a minute, so a page cached before a change still shows an avatar. The edge caches a current image for a day instead of a year, so a replaced image, or the image of a closed account, leaves the edge within a day with no purge per change. A browser that already showed the image keeps its cached copy.

A provider photo keeps one version because its url lives at the provider. Hashing that url would add the `image` column to every avatar query, for a change that is rare. The redirect's hour limits how long an old photo shows. The redirect exists only while the user publishes the provider photo, so it gets the same hour at any `v`.

Alternatives considered:

- Keeping the counter with a longer max-age. The counter resets to zero on every reload and in every other tab, so a changed avatar would stay stale for everyone but the uploader.
- Redirecting an unversioned url to a versioned one. Every avatar would cost two requests.
- Purging an avatar's url on each change. It needs the Cloudflare token in the api and a call in every path that replaces or deletes an avatar. The one-day edge age needs neither.

### A preview card's url includes its key's version

The og image urls built in `api/share/pageHead.ts` gain `?v=<version>`, a short hash of the card's storage key. The key already changes with the title, the owner, the avatar, the counts, and the template version. The card routes send the same headers as an avatar: `immutable` with a one-day `CDN-Cache-Control` if `v` is the current key's version, and `public, max-age=60` otherwise. The social platforms cache by url and ignore headers, so a new url is the only way they fetch a changed card.

### Pages and the signed-out feed are shared at the edge for a minute

One helper in a new `api/edgeCache.ts` sets the headers for every page the ui renders, the blog and release pages, and `/api/topic-feed`:

| Response | `Cache-Control` | `CDN-Cache-Control` | `Cache-Tag` |
|---|---|---|---|
| 200, no session cookie or `Authorization` header on the request, no `Set-Cookie` on the response | `no-cache` | `max-age=60, stale-while-revalidate=60` | `rendered` |
| Any other response | `private, no-cache` | none | none |

The session cookie is read with Better Auth's `getSessionCookie`, the same function `ui/src/lib/sessionCookie.ts` uses to decide whether a page renders on the server. The browser keeps `no-cache`, exactly as today, so a visitor who signs in never reuses a copy from before. Cloudflare reads `CDN-Cache-Control` in place of `Cache-Control` and passes `Cache-Control` to the browser unchanged. After a minute the edge serves its stale copy once and fetches a new one in the background.

A made-private topic leaves the edge within two minutes: a minute fresh, then at most a minute served stale. That limit is why the stale window is 60 seconds and not longer.

Alternative considered: `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=60`. A browser applies `stale-while-revalidate` too, so it could show its own signed-out copy once after its user signs in.

### Each release purges the rendered responses

A cached page can outlive the deploy that built it and name hashed assets the new container no longer has. The release purges the edge instead of keeping the previous build's assets.

- `api/edgeCache.purge.ts` posts `{"tags": ["rendered"]}` to `https://api.cloudflare.com/client/v4/zones/<CLOUDFLARE_ZONE_ID>/purge_cache` with `Authorization: Bearer <CLOUDFLARE_API_TOKEN>`. Purge by tag is available on every plan.
- The `edge:purge` package script runs it under `doppler run`, as `docs:embed` runs the docs sync.
- A new Northflank job, `edge-purge`, runs `bun run edge:purge` from the release's build. `release-main.json` runs it right after `deploy-app`.
- The script logs and exits 0 if the settings are unset or the purge fails. A missed purge costs at most two minutes of old pages, and it must never delay the worker's deploy.

Only responses tagged `rendered` are purged. Hashed assets, avatars, cards, and favicons stay at the edge, so a page served by an old container that is still shutting down after the purge can still load its old assets.

Alternatives considered:

- Purging everything. Every image and asset would be fetched again from the one origin after each release, and the old assets would go with them.
- Keeping each build's assets in object storage and serving a missing asset from there. It needs an upload on every boot and a storage fallback for the ui and the docs assets, all for a window of two minutes.

### Compression moves to the edge

`compress()` leaves `api/index.ts`. Cloudflare compresses every proxied text response, cached or not, and prefers brotli. It streams `text/event-stream` and responses without a content type through untouched, which covers the SSE streams and the chat reply stream, exactly as `compress()` skipped them.

This frees 6 to 26 ms of the one thread per feed response, and a cached response is compressed once instead of on every request. A request sent straight to the origin is served uncompressed, and the origin sends about three times the bytes to the edge for text.

### Better Auth and the limiter share one client address

`api/trustedProxies.ts` exports one options object, `{ trustedProxies, ipAddressHeaders: ["x-forwarded-for"] }`. `api/auth.ts` passes it as `advanced.ipAddress`, and the limiter calls Better Auth's own `getIp(request, { advanced: { ipAddress } })` with the same object. `getIp` walks `x-forwarded-for` from the right, skips every entry inside a trusted range, and returns the first address outside them, or null if an entry is malformed. The limiter keys by that address, or by the shared bucket if it is null. `toClientAddress` and its hop count are removed.

- Behind Cloudflare the chain arrives as `<visitor>, <Cloudflare edge>`. The edge address is trusted, so the visitor is the client.
- A forged entry sits left of the visitor and is never reached.
- A request sent straight to the origin arrives as `<anything>, <sender>`. The sender is not trusted, so the sender is the client.
- An IPv6 client is keyed by its /64, Better Auth's default.

`checkTrustedProxies`, which was `reportForwardedChain`, also checks the first request with a `cf-ray` header in each process, and warns if `TRUSTED_PROXIES` is set and that request resolves to no client or to an internal address, checked with the worker's existing `isInternalAddress`. Either one means the platform added a hop that `TRUSTED_PROXIES` does not list, and every caller would share one bucket.

`TRUSTED_PROXIES` in prd must list exactly Cloudflare's published ranges, and nothing else as long as the platform adds no hop after Cloudflare's. It already does, verified on 2026-09-29:

```
173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22,2400:cb00::/32,2606:4700::/32,2803:f800::/32,2405:b500::/32,2405:8100::/32,2a06:98c0::/29,2c0f:f248::/32
```

Cloudflare publishes the list at cloudflare.com/ips-v4 and cloudflare.com/ips-v6. If Cloudflare adds a range, the setting gets it too. If the warning names an internal hop, that hop's range is added.

### Cloudflare settings

None of this lives in the repo. Each setting is created or confirmed by hand in the carlnotes.com zone.

SSL/TLS:

- Overview: encryption mode **Full (strict)**. Northflank serves a certificate valid for carlnotes.com.
- Edge Certificates: **Always Use HTTPS** on, **Minimum TLS Version** 1.2.

Caching → Configuration:

- **Caching Level**: Standard, so the query string is part of the cache key and `?v=` works.
- **Browser Cache TTL**: Respect Existing Headers. A fixed value would replace `no-cache` on the way to the browser.

Caching → Tiered Cache: **Smart Tiered Cache Topology** on, so a miss in one data center asks an upper tier before the origin.

Caching → Cache Rules, in this order. The last matching rule wins a conflict, so the bypass comes second.

1. **Cache by the origin's headers**
   - Expression:
     ```
     (not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/mcp") and not starts_with(http.request.uri.path, "/.well-known/acme-challenge/"))
     or http.request.uri.path eq "/api/topic-feed"
     or starts_with(http.request.uri.path, "/api/avatars/")
     or starts_with(http.request.uri.path, "/api/team-avatars/")
     or starts_with(http.request.uri.path, "/api/favicons/")
     or ends_with(http.request.uri.path, "/preview.png")
     ```
   - Cache eligibility: Eligible for cache.
   - Edge TTL: Use cache-control header if present, bypass cache if not.
   - Browser TTL: Respect origin.
   - Cache key: the default, which includes the whole query string.
   - Serve stale content while revalidating: on.
2. **Bypass signed-in requests**
   - Expression: `http.cookie contains "better-auth.session_token=" or http.cookie contains "better-auth-session_token="`, which matches every name `getSessionCookie` accepts, the `__Secure-` names production uses included.
   - Cache eligibility: Bypass cache.

What the rules never cache: every other api route, every authenticated one included, the SSE streams under `/api/`, and `/mcp`. Also any response without a `Cache-Control` header, any response the origin marks `private` or `no-store`, and any response with `Set-Cookie`. Cloudflare does not cache a `Set-Cookie` response while Origin Cache Control is on, and the origin never marks one shared.

Security → WAF → Custom rules, first in the list:

- **Let certificate renewals through**: expression `starts_with(http.request.uri.path, "/.well-known/acme-challenge/")`. Action **Skip**: all remaining custom rules, all rate limiting rules, all managed rules, and every component under "More components to skip". Log matching requests on.
- Security → Bots: **Bot Fight Mode** off. A custom rule cannot skip it, and it can challenge the certificate authority.

Features that rewrite the HTML, all off: Rocket Loader, Email Address Obfuscation, Automatic HTTPS Rewrites, Cloudflare Fonts, and Web Analytics' automatic setup. A server-rendered page that changes in transit no longer matches what the client hydrates, and the content security policy blocks an injected script.

Compression: Cloudflare's default, on. No compression rule is needed.

The purge token: My Profile → API Tokens → Create Token, permission **Zone → Cache Purge → Purge**, zone resources **carlnotes.com** only. It is saved in Doppler prd as `CLOUDFLARE_API_TOKEN`, beside `CLOUDFLARE_ZONE_ID` from the zone's Overview page.

## Risks / Trade-offs

- [A made-private or deleted topic stays visible to signed-out visitors for up to two minutes.] → The 60-second edge age and the 60-second stale window set the limit. A purge per visibility change can follow if it matters.
- [An RSS feed, the sitemap, and the llms files now stay at the edge for their existing max-age.] → The same ages already applied to browsers and feed readers.
- [A replaced avatar or card, or a closed account's avatar, stays at the edge for up to a day at its old url.] → Nothing links to the old url once a page reloads its payloads, and the key id in it is random.
- [Each release empties the edge's pages.] → The first visitor to each page after a deploy renders it at the origin, which every visitor does today.
- [A request sent straight to Northflank's own hostname is served uncompressed.] → Nothing links there.
- [Northflank may add a hop after Cloudflare's that `TRUSTED_PROXIES` does not list.] → The api's warning names it. Until its range is added, anonymous callers share one bucket, as they all do today.
- [Full (strict) fails every request if the origin certificate lapses, and the renewal fails with it, since Cloudflare reaches the origin over https.] → Northflank renews weeks before expiry. If a certificate ever lapses, switch to Full until the renewal succeeds.
- [If Cloudflare ignored `CDN-Cache-Control` under the rule, pages would still revalidate every time.] → That is today's behavior, and the second request in the migration's checks shows it. The fallback is `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=60`.
- [The origin sends about three times the bytes to Cloudflare for text.] → The link to the edge is not the bottleneck. The one thread is.

## Migration Plan

1. Create the purge token, and save `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` in Doppler prd.
2. In Northflank, create the `edge-purge` job the way `docs-sync` is set up: manual trigger, deployed from the `build` service's builds, the same Doppler token, and the command `bun run edge:purge`. Update the `release-main` workflow from `infra/northflank/release-main.json`.
3. Confirm or set the zone settings above, and create the WAF rule.
4. Push. The release deploys the app and runs `edge-purge` right after it.
5. Create the two cache rules, in order.
6. Check from a terminal:
   - A public topic page twice: `cf-cache-status` MISS, then HIT, with `cache-control: no-cache` and `cdn-cache-control: max-age=60, stale-while-revalidate=60`.
   - The same page with `-H 'cookie: __Secure-better-auth.session_token=x'`: BYPASS and `cache-control: private, no-cache`.
   - `/api/topic-feed` twice: HIT the second time, and `content-encoding: br` with `-H 'accept-encoding: br'`.
   - An avatar url from a payload and the `og:image` url from a topic page: `immutable`, and HIT the second time.
   - The `edge-purge` job's log shows the purge, and the next page request is a MISS.
   - A question to Carl in chat still streams its reply line by line.
   - Two anonymous MCP requests from one network lower `ratelimit-remaining`, and one from another network starts at the full limit.
7. Confirm that Northflank's next certificate renewal for carlnotes.com succeeds.

Rollback: delete the two cache rules, which returns the zone to caching by file extension alone, and revert the commit. The purge job does no harm on its own.

## Open Questions

- Whether Northflank's ingress adds its own hop after Cloudflare's. The chain seen so far had two entries, and the new warning settles it on the first proxied request.
- Whether the zone is on the Free plan. It decides whether Bot Fight Mode has to stay off or can be skipped for the certificate authority.
