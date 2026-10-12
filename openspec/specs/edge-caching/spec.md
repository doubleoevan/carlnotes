# edge-caching Specification

## Purpose
TBD - created by archiving change cache-at-the-edge. Update Purpose after archive.
## Requirements
### Requirement: A signed-out page and the signed-out feed are shared at the edge for a minute

The api SHALL send a page the ui's server renders, a blog page, a release page, and `/api/topic-feed` with
`Cache-Control: no-cache`, `CDN-Cache-Control: max-age=60, stale-while-revalidate=60, stale-if-error=120`, and
`Cache-Tag: rendered` if the response is a 200 or a permanent redirect (301 or 308), the request has no Better Auth
session cookie and no `Authorization` header, and the response sets no cookie. Every other response from those routes
SHALL be sent with `Cache-Control: private, no-cache` and no `CDN-Cache-Control`. The browser always revalidates, and
only the edge shares a copy. A permanent redirect is shared so a stale link in circulation, such as a topic's old slug,
costs the origin one response a minute instead of one per click. The edge MAY serve a shared copy stale for up to two
minutes while the origin responds with an error, so a shed render's 503 reaches a visitor only where the edge has no
copy.

#### Scenario: A public topic page is shared at the edge

- **WHEN** a request without a session cookie renders a public topic page
- **THEN** the response has `Cache-Control: no-cache` and `CDN-Cache-Control: max-age=60, stale-while-revalidate=60,
  stale-if-error=120`

#### Scenario: The same page with a session cookie is private

- **WHEN** the same page is requested with a Better Auth session cookie
- **THEN** the response has `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: The signed-out feed is shared and the signed-in feed is not

- **WHEN** `/api/topic-feed` is requested without a session cookie, then with one
- **THEN** the first response has the shared `CDN-Cache-Control`, and the second has `Cache-Control: private, no-cache`
  and no `CDN-Cache-Control`

#### Scenario: A response that sets a cookie is never shared

- **WHEN** a page response for a request without a session cookie includes `Set-Cookie`
- **THEN** it is sent with `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: A page that did not render is never shared

- **WHEN** a page responds with a status other than 200, 301, or 308
- **THEN** it is sent with `Cache-Control: private, no-cache`

#### Scenario: A permanent redirect is shared

- **WHEN** a request without a session cookie reaches a topic's old slug and is redirected permanently
- **THEN** the redirect is sent with the shared `CDN-Cache-Control`

### Requirement: The edge caches by the origin's headers and bypasses a signed-in request

Cloudflare SHALL treat as cacheable only the page paths, the discovery files, the client bundle, the docs, `/api/topic-feed`, and the avatar, team avatar, favicon, and card paths, and SHALL cache each one only as long as the origin's headers allow, bypassing any response without a `Cache-Control` header. It SHALL bypass its cache for every request with a Better Auth session cookie. Every other api route, every SSE stream, `/mcp`, and every response that sets a cookie SHALL never be cached at the edge. The zone SHALL use SSL/TLS Full (strict), and no security rule SHALL challenge a request under `/.well-known/acme-challenge/`.

#### Scenario: A signed-in request is never served from the edge

- **WHEN** a request has a Better Auth session cookie
- **THEN** Cloudflare bypasses its cache and the origin serves the request

#### Scenario: An authenticated api route is never cached

- **WHEN** a request reaches an api route other than the signed-out feed, an avatar, a favicon, or a card
- **THEN** Cloudflare passes it to the origin and caches nothing

#### Scenario: A certificate renewal reaches the origin

- **WHEN** the certificate authority requests a path under `/.well-known/acme-challenge/`
- **THEN** no security rule challenges it and no cache rule caches it

### Requirement: A stored image's url changes exactly when the image does

An avatar url SHALL include `v=<version>`. A user's version SHALL be the stored upload's key id, `oauth` for a provider photo, and null for the initials, which have no url. A team's version SHALL be its stored upload's key id, and null for a team with none. A preview card's url SHALL include `v=<version>`, a hash of the card's storage key. An avatar's version SHALL be computed by one function the api and the ui share. Every payload with a user's `avatarSource` SHALL include `avatarVersion` beside it, and a team payload SHALL include `avatarVersion` in place of `hasAvatar`.

The exact change applies to a stored image. A provider photo's url keeps the `oauth` version when the provider changes the photo, and the redirect's hour-long cache bounds how long the old photo shows.

#### Scenario: A new upload changes the url

- **WHEN** a user uploads a new avatar
- **THEN** its version is the new key's id, different from every earlier version

#### Scenario: The same image keeps its url

- **WHEN** a user's avatar is read twice with no upload or source change between the reads
- **THEN** both reads give the same version

#### Scenario: A source change changes the url

- **WHEN** a user moves between an upload, the provider photo, and the initials
- **THEN** the version changes with each move, and it is null on the initials

#### Scenario: A provider's own photo change keeps the url

- **WHEN** the provider changes the photo behind a user's opted-in provider avatar
- **THEN** the version stays `oauth`, and the new photo shows once the redirect's hour-long cache runs out

#### Scenario: A team upload changes the team's url

- **WHEN** a team leader uploads a new team avatar
- **THEN** the team's version is the new key's id

#### Scenario: A changed card gets a new url

- **WHEN** a topic's title changes
- **THEN** the `og:image` url on its page names a new version

### Requirement: A versioned image is immutable only at its current version

An avatar route, the team avatar route, and a card route SHALL send a stored image with `Cache-Control: public, max-age=31536000, immutable` and `CDN-Cache-Control: max-age=86400` if `v` equals the current version, and with `Cache-Control: public, max-age=60` otherwise. A provider photo redirect SHALL be sent with `Cache-Control: public, max-age=3600`.

#### Scenario: The current version is immutable

- **WHEN** an avatar is requested at its current version
- **THEN** it is served `immutable` for a year, and the edge caches it for a day

#### Scenario: An old version gets the current image briefly

- **WHEN** an avatar is requested at a version from before its latest upload
- **THEN** the current image is served with `Cache-Control: public, max-age=60`

#### Scenario: A card without a version is not immutable

- **WHEN** a card is requested with no `v`
- **THEN** it is served with `Cache-Control: public, max-age=60`

### Requirement: An upload shows at once on the uploader's page

The ui SHALL draw the signed-in user's own avatar at the session's version, whatever version a payload names, so an upload changes every copy of that avatar on the page once the session refreshes. A team avatar upload SHALL reload the team it changed. The ui SHALL keep no avatar version of its own.

#### Scenario: A user's upload shows everywhere on their page

- **WHEN** a user uploads an avatar while their chat messages are on the page
- **THEN** every copy of their avatar on the page requests the new version once the session refreshes

#### Scenario: A team upload shows on the team's page

- **WHEN** a leader uploads a team avatar from the team page
- **THEN** the page reloads the team and draws its new version

### Requirement: Each release purges the rendered responses from the edge

The release pipeline SHALL purge every edge response tagged `rendered` right after the new app is running, with
Cloudflare's purge by tag, which includes the unhashed public files. A purge request SHALL give up after ten seconds. A
missing Cloudflare setting SHALL be logged, and a failed purge SHALL be logged and reported to Sentry, and neither SHALL
fail the release.

#### Scenario: A release purges the pages

- **WHEN** a release has deployed the app
- **THEN** the purge job clears the `rendered` tag before the worker deploys

#### Scenario: Images and assets survive the purge

- **WHEN** the purge runs
- **THEN** hashed assets, avatars, cards, and the Sources' favicons the api serves stay cached at the edge, while the
  site's own unhashed public files, its favicon among them, are cleared with the pages

#### Scenario: A failed purge does not stop the release

- **WHEN** the purge request fails
- **THEN** the job logs why, reports the failure to Sentry, and exits successfully, and the worker still deploys

#### Scenario: Unset purge settings do not stop the release

- **WHEN** the Cloudflare settings are unset
- **THEN** the job logs that the purge was skipped, reports nothing, and exits successfully, and the worker still
  deploys

### Requirement: Compression happens only at the edge

The origin SHALL NOT compress any response. Cloudflare compresses text responses on the way to the browser.

#### Scenario: The origin sends the feed uncompressed

- **WHEN** `/api/topic-feed` is requested with `Accept-Encoding: gzip, br`
- **THEN** the origin's response has no `Content-Encoding` header

### Requirement: Public podcast feeds are shared at the edge, and private ones are never stored

A public Topic's podcast feed and its public Podcast Episode pages SHALL set their edge headers through
`api/edgeCache.ts`, the way every other rendered public response does, so the edge's cache rules cover them. A
per-listener podcast feed, the audio redirect, and a per-listener chapters or transcript file SHALL be
sent with `Cache-Control: private, no-store`, so neither the edge nor a shared cache stores a response that a token or a
session authorized.

#### Scenario: A public feed is cached at the edge

- **WHEN** a signed-out client requests a public Topic's podcast feed
- **THEN** the response has the same edge cache headers and cache tag as a rendered public page

#### Scenario: A per-listener feed is never stored

- **WHEN** a client requests a per-listener podcast feed
- **THEN** the response is sent with `Cache-Control: private, no-store`

#### Scenario: The audio redirect is never stored

- **WHEN** a client requests a Podcast Episode's audio url
- **THEN** the redirect is sent with `Cache-Control: private, no-store`

### Requirement: A deleted avatar is purged from the edge by its tag

A user avatar response SHALL include `Cache-Tag: user-avatar:<userId>`, and a team avatar response `Cache-Tag:
team-avatar:<teamId>`, at every version. The purge SHALL take any list of tags, and the release purge SHALL keep
clearing `rendered` through it. Once an account close or a team deletion has committed, the api SHALL purge that
account's or team's tag once, reading `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` from its own environment. A failed
purge SHALL be reported, a purge skipped for unset settings SHALL be logged, and neither SHALL fail the deletion.
Nothing retries a purge. The day-long edge lifetime bounds a missed one. Share previews, podcast covers, chat room
preview images, and browser caches are out of scope.

#### Scenario: An avatar response is tagged

- **WHEN** a user avatar or a team avatar is served at any version
- **THEN** the response's `Cache-Tag` names that user's or team's tag

#### Scenario: A deletion purges its tag once

- **WHEN** an account is closed or a team is deleted
- **THEN** one purge request names that tag, sent after the deletion committed

#### Scenario: A failed purge does not fail the deletion

- **WHEN** the purge request fails or the Cloudflare settings are unset
- **THEN** the failure is reported or the skip is logged, and the deletion's response is unchanged

#### Scenario: The release purge still clears the pages

- **WHEN** the release purge job runs
- **THEN** it clears the `rendered` tag as before

### Requirement: A page url with a click id redirects to the url without it

A page request whose query has an ad or social platform's click id, such as `fbclid`, `gclid`, `msclkid`, `twclid`,
`ttclid`, or `igshid`, SHALL be redirected permanently to the same path and query without those ids, which is the url
the edge has cached. A page the ui's server renders, a blog page, and a release page SHALL each redirect so. Campaign
parameters such as `utm_source` SHALL be kept. The redirect SHALL stay on this site, and a visitor's redirect SHALL be
shared at the edge like any other permanent redirect.

#### Scenario: A shared link with a click id

- **WHEN** a visitor opens `/topics/abc?fbclid=x&utm_source=newsletter`
- **THEN** they are redirected permanently to `/topics/abc?utm_source=newsletter`

