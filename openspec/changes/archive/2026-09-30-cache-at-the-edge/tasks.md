## 1. Avatar versions

- [x] 1.1 In `shared/avatars.ts`, add `toAvatarVersion`: a stored key's id, its file name without the extension, for an upload or a team's key, `oauth` for a provider photo, and null otherwise. Test that the version changes with the key, stays the same for the same key, and follows each source
- [x] 1.2 Add `avatarVersion` beside every `avatarSource` in `shared/contracts.ts` and in every api payload that builds one, selecting `avatarKey` beside `avatarSource` in each query
- [x] 1.3 Replace a team payload's `hasAvatar` with `avatarVersion` in `shared/contracts.ts` and in every api payload that builds it, starting from `api/team/helpers.ts`, `api/activity.ts`, and `api/admin.ts`
- [x] 1.4 In `api/avatars.ts`, compare `v` with the current version on both avatar routes and send each row of the design's avatar table. Test every row for a user and for a team
- [x] 1.5 Make `UserAvatar` and `TeamAvatar` take `avatarVersion`, request `?v=<version>`, and draw the initials for null. `UserAvatar` draws the signed-in user's own avatar at the session's version. Update every caller
- [x] 1.6 Remove `ui/src/hooks/useAvatarVersion.ts`. A user's upload and source change refresh the session alone, and the team upload flows in `teamClient.ts`, `EditTeamModal.tsx`, and `TeamPage.tsx` reload the team they changed
- [x] 1.7 Delete a team's stored avatar image wherever the team is deleted: `deleteTeam` in `api/team/teams.ts`, and a closed account's sole-member teams in `api/users.ts`. A failed delete is logged. Check it in `api/team/teams.smoke.ts` with a real stored image

## 2. Card versions

- [x] 2.1 Add a card version function beside the card key functions, a short hash of the storage key, and add `?v=<version>` to the topic, profile, team, and invite card urls in `api/share/pageHead.ts` and the invite head route
- [x] 2.2 In the card routes, send `immutable` with `CDN-Cache-Control: max-age=86400` only at the current version, and `public, max-age=60` otherwise. Test that a retitled topic's head names a new version, and both header rows

## 3. Pages and the feed at the edge

- [x] 3.1 Add `api/edgeCache.ts` with the `rendered` tag and the helper that sets the design's two header sets from the request's session cookie, the status, and `Set-Cookie`. Test each case
- [x] 3.2 Apply the helper to `renderUiPage` in `api/index.ts`, the blog routes in `api/content.ts`, the release pages in `api/releases.ts`, and `/api/topic-feed` in `api/api.ts`. Test that a page and the signed-out feed have the shared `CDN-Cache-Control` without a session cookie, and `private, no-cache` with one
- [x] 3.3 Remove `compress()` from `api/index.ts`, and test that the feed comes back without `Content-Encoding` to a request that accepts gzip and brotli

## 4. One client address

- [x] 4.1 Export the one `ipAddress` options object from `api/trustedProxies.ts`, and pass it from `api/auth.ts` as `advanced.ipAddress` whether or not `TRUSTED_PROXIES` is set
- [x] 4.2 In `api/rateLimit.ts`, key an anonymous caller by Better Auth's `getIp` with that object, and remove `toClientAddress`. Test with Cloudflare's ranges: the visitor behind a Cloudflare hop, a forged left entry, a request that skips the edge, and that Better Auth is configured with the same object and resolves the same address
- [x] 4.3 Export `isInternalAddress` from `worker/index.ts`, and extend `reportForwardedChain` in `api/auth.ts`, now `checkTrustedProxies`, to take the request and warn once if `TRUSTED_PROXIES` is set and a request with a `cf-ray` header resolves to no client or to an internal address. Test that it warns once, and not at all for a public client

## 5. The release purge

- [x] 5.1 Add `api/edgeCache.purge.ts`, which purges the `rendered` tag and logs and exits 0 if the Cloudflare settings are unset or the purge fails. Test the request it sends with a stubbed fetch, and both failure cases
- [x] 5.2 Add the `edge:purge` package script, `doppler run -- bun api/edgeCache.purge.ts`
- [x] 5.3 Add a `run-edge-purge` step to `infra/northflank/release-main.json` right after `deploy-app`, running the `edge-purge` job from the release's build

## 6. Docs

- [x] 6.1 README: a Cloudflare section on what the edge caches, the session cookie bypass, compression at the edge, `TRUSTED_PROXIES`, and where the settings live, the edge purge beside the other deploy jobs, `edge:purge` in the Development section, and the load testing note already in the working tree
- [x] 6.2 `.env.example`: `TRUSTED_PROXIES` as Cloudflare's ranges, read from the right, and the new `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN`
- [x] 6.3 `api/AGENTS.md`: `edgeCache.ts`, `edgeCache.purge.ts`, and the limiter's line. `ui/AGENTS.md` wherever it names `useAvatarVersion`
- [x] 6.4 Add `useAvatarVersion` and `refreshAvatars`, `toClientAddress`, and a team's `hasAvatar` to the stale-drift list in `.agents/commands/audit-structure.md`

## 7. Verification

- [x] 7.1 Run `bash scripts/preflight.sh`
- [x] 7.2 Extend the smoke tests where only a real database, build, or server can prove it. `api/seo.smoke.ts`: a public topic page fetched through the api has the shared edge headers and the `rendered` tag, and `private, no-cache` with a session cookie, its `og:image` url names `?v=` and is served `immutable`, and `/api/topic-feed` has no `Content-Encoding`. `api/team/teams.smoke.ts`: a team and a member with a stored key get their `avatarVersion`. `api/invite/invites.smoke.ts`: a sent team invite's invitee gets the version of the account it resolved to. Run the three under doppler
- [x] 7.3 Against the local dev api, read the headers of a public topic page and `/api/topic-feed` with and without a session cookie, and of an avatar url and a card url at the current version and at an old one
- [x] 7.4 In a browser, upload a user avatar and see every copy on the page change, then upload a team avatar on the team page and see it change there
