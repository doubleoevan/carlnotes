# edge-caching Specification

## Purpose
TBD - created by archiving change cache-at-the-edge. Update Purpose after archive.
## Requirements
### Requirement: A signed-out page and the signed-out feed are shared at the edge for a minute

The api SHALL send a page the ui's server renders, a blog page, a release page, and `/api/topic-feed` with `Cache-Control: no-cache`, `CDN-Cache-Control: max-age=60, stale-while-revalidate=60`, and `Cache-Tag: rendered` if the response is a 200, the request has no Better Auth session cookie and no `Authorization` header, and the response sets no cookie. Every other response from those routes SHALL be sent with `Cache-Control: private, no-cache` and no `CDN-Cache-Control`. The browser always revalidates, and only the edge shares a copy.

#### Scenario: A public topic page is shared at the edge

- **WHEN** a request without a session cookie renders a public topic page
- **THEN** the response has `Cache-Control: no-cache` and `CDN-Cache-Control: max-age=60, stale-while-revalidate=60`

#### Scenario: The same page with a session cookie is private

- **WHEN** the same page is requested with a Better Auth session cookie
- **THEN** the response has `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: The signed-out feed is shared and the signed-in feed is not

- **WHEN** `/api/topic-feed` is requested without a session cookie, then with one
- **THEN** the first response has the shared `CDN-Cache-Control`, and the second has `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: A response that sets a cookie is never shared

- **WHEN** a page response for a request without a session cookie includes `Set-Cookie`
- **THEN** it is sent with `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: A page that did not render is never shared

- **WHEN** a page responds with a status other than 200
- **THEN** it is sent with `Cache-Control: private, no-cache`

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

The release pipeline SHALL purge every edge response tagged `rendered` right after the new app is running, with Cloudflare's purge by tag. A missing Cloudflare setting or a failed purge SHALL be logged and SHALL NOT fail the release.

#### Scenario: A release purges the pages

- **WHEN** a release has deployed the app
- **THEN** the purge job clears the `rendered` tag before the worker deploys

#### Scenario: Images and assets survive the purge

- **WHEN** the purge runs
- **THEN** hashed assets, avatars, cards, and favicons stay cached at the edge

#### Scenario: A failed purge does not stop the release

- **WHEN** the purge request fails, or the Cloudflare settings are unset
- **THEN** the job logs why and exits successfully, and the worker still deploys

### Requirement: Compression happens only at the edge

The origin SHALL NOT compress any response. Cloudflare compresses text responses on the way to the browser.

#### Scenario: The origin sends the feed uncompressed

- **WHEN** `/api/topic-feed` is requested with `Accept-Encoding: gzip, br`
- **THEN** the origin's response has no `Content-Encoding` header

