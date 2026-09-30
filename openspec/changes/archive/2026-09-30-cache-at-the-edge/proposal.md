## Why

Cloudflare already proxies carlnotes.com, but it caches almost nothing: one Bun process still renders every page, builds every feed response, streams every avatar and favicon, and gzips each text response on its only thread. Cloudflare caches only paths with a static file extension. Pages go out `no-cache`, and the signed-out feed, avatars, and favicons have no extension, so every request reaches the origin. The signed-out feed is byte-identical for every visitor, 641 KB before compression in production, and costs ten queries a request. A shared topic link is the viral path, and every visit to one renders the page from scratch.

What blocks caching is not the proxy but the origin's urls and headers, and two of them are wrong today. A preview card is served `immutable` at a url that never changes, so a renamed topic's card can stay stale at the edge for up to a year, which the social-sharing spec already forbids. The MCP limiter reads `TRUSTED_PROXIES` as a hop count, and production sets it to Cloudflare's 22 ranges, so every anonymous MCP caller shares one bucket.

## What Changes

- An avatar url includes a version taken from the image itself: an upload's storage key id, or `oauth` for a provider photo. A user payload gets `avatarVersion` beside `avatarSource`, and a team payload's `hasAvatar` becomes `avatarVersion`, null for a team with none. A request at the current version is served `immutable` for a year, and the edge caches it for a day. The module-scope `useAvatarVersion` counter is removed. The signed-in user's own avatar takes its version from the session, and a team upload reloads the team it changed, so an upload still shows at once on the uploader's page.
- Deleting a team deletes its stored avatar image, the way closing an account already deletes the user's. Until now the image stayed in storage forever.
- A preview card's url includes a version taken from the card's storage key, so a changed card gets a new url, as the social-sharing spec requires. A card is `immutable` only at its current version.
- A page rendered for a request without a session cookie, the blog and release pages included, is sent `Cache-Control: no-cache` for the browser and `CDN-Cache-Control: max-age=60, stale-while-revalidate=60` for the edge, so the edge serves it while it revalidates. A page for a request with a session cookie is sent `private, no-cache`. The signed-out topic feed gets the same pair.
- The rate limiter resolves the client the way Better Auth does, through Better Auth's own `getIp` and one shared options object: the rightmost address that is not a trusted proxy. A forged entry on the left is ignored, and a request that skips the edge still resolves to its sender. The api warns once if a request that came through Cloudflare resolves to no client or to an internal address, which means a platform hop is missing from `TRUSTED_PROXIES`.
- Compression moves to the edge. The origin drops `compress()`, and Cloudflare compresses every proxied text response, cached or not, with brotli where a client accepts it.
- Each release purges the edge's pages and feed right after the new app is running, so no cached page names hashed assets the new container no longer has. Hashed assets, avatars, and cards stay cached.
- The design lists the exact Cloudflare settings to create or confirm: the cache rules, the session cookie bypass, SSL/TLS Full (strict), and the security rule that lets Northflank renew its certificate.
- The README gains a Cloudflare section, the edge purge deploy job, and the load testing note.

## Capabilities

### New Capabilities

- `edge-caching`: what the edge may cache and for how long, versioned image urls, the session cookie bypass, compression at the edge, and the purge on each release.

### Modified Capabilities

- `static-serving`: a page rendered for a visitor without a session cookie is shared briefly at the edge, and a page for a signed-in visitor is private.
- `user-avatars`: a stored avatar is served at a versioned url, `immutable` at its current version, replacing the `no-store` the spec states and the five-minute cache the code sends.
- `mcp-server`: the rate limiter keys an anonymous caller by the rightmost untrusted address, resolved exactly as Better Auth resolves it.
- `teams`: deleting a team also deletes its stored avatar image.

## Impact

- `shared/avatars.ts` (the version), `shared/contracts.ts` (the `avatarVersion` fields), and every api payload with a user's `avatarSource` or a team's `hasAvatar`.
- `api/avatars.ts`, `api/api.ts` (the feed and the card routes), `api/share/pageHead.ts`, `api/share/preview.ts`, `api/index.ts` (the page headers and the removed `compress()`), `api/content.ts`, `api/releases.ts`, `api/rateLimit.ts`, `api/trustedProxies.ts`, `api/auth.ts`, and a new `api/edgeCache.ts`.
- `ui/src/components/branding/UserAvatar.tsx`, `TeamAvatar.tsx`, their callers, the avatar upload flows, and the removed `ui/src/hooks/useAvatarVersion.ts`.
- `api/team/teams.ts` and `api/users.ts`, where a team is deleted.
- A new deploy job: `api/edgeCache.purge.ts`, the `edge:purge` script, an `edge-purge` step in `infra/northflank/release-main.json`, and two Doppler settings, `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN`.
- Cloudflare's dashboard, configured by hand from the design. No dependency is added.
