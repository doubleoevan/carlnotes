## ADDED Requirements

### Requirement: A Topic's pages and a team page carry tags that a purge can name

A Topic's rendered page, its podcast episode pages, its Topic Post pages, and their page reads SHALL carry one page tag
of the Topic's own beside `rendered`. A team page and its page read SHALL carry a tag of the team's own. A Topic's
visibility change and its deletion SHALL purge the Topic's tag, and a team's visibility change and its deletion the
team's, so a page that turns private leaves the edge at once.

#### Scenario: A Topic made private leaves the edge at once

- **WHEN** an owner makes a public Topic private
- **THEN** one purge names the Topic's page tag, and the next request without a session for its page, a podcast episode
  page of it, or a Topic Post page of it reaches the origin and is not found

#### Scenario: A team made private leaves the edge

- **WHEN** a leader makes a public team private
- **THEN** the team's tag is purged, and the next request without a session for its page reaches the origin

#### Scenario: A deleted Topic is purged

- **WHEN** an owner deletes a public Topic
- **THEN** its page tag is purged with its image tag

### Requirement: One purge carries every tag of a write

A write that purges more than one tag SHALL send them in one purge request. The film backfill's swaps SHALL clear origin
copies alone and SHALL purge nothing, so the platform's own re-renders never spend the zone's purge allowance.

#### Scenario: A Topic's visibility change sends one purge

- **WHEN** a Topic's save purges its page tag, its image tag, its owner's profile, and the home
- **THEN** one purge request names all of those tags

#### Scenario: A backfill's re-render purges nothing

- **WHEN** the backfill swaps a re-rendered film's files
- **THEN** the Topic's origin copies are cleared, and no purge request is sent

### Requirement: A page read reaches the edge only once a tag can purge it and the rule names its path

A page read SHALL send the rendered page's shared headers only once its page carries a tag that a purge can name and
Cloudflare's cache rule names the page read's path. Until then it SHALL send no `CDN-Cache-Control`, and visitors SHALL
share it at the origin alone. The release that adds the page reads SHALL ship them that way, and the headers SHALL be
turned on after the edge check passes.

#### Scenario: A page read ships at the origin alone

- **WHEN** the page reads are first deployed, before Cloudflare's rule names their paths
- **THEN** a visitor's page read has no `CDN-Cache-Control`, and its second read is served from the origin's copy

#### Scenario: The headers follow the rule and the check

- **WHEN** an operator adds a page read's path to Cloudflare's rule and the edge check passes
- **THEN** the page read is sent with the shared headers and its page's tags, and a second visitor's read is an edge hit

### Requirement: The edge's cache rule is recorded in the deployment guide and checked

Cloudflare's whole cache rule, its bypass rule, and the zone's settings SHALL be recorded in the deployment guide, and
each new shared path SHALL be a manual step listed there. A read-only script SHALL request each path that the origin
marks shared twice and SHALL fail if the second response's `cf-cache-status` is `DYNAMIC` or `BYPASS`.

#### Scenario: A path the rule does not name fails the check

- **WHEN** the origin marks `/api/home` shared and Cloudflare's rule does not name it
- **THEN** the check fails and names `/api/home`

#### Scenario: A named path passes

- **WHEN** the check requests a path that the rule names twice without a session
- **THEN** the second response is an edge hit, and the check passes for that path

#### Scenario: The check writes nothing

- **WHEN** the check runs against production
- **THEN** it sends `GET` requests alone, to no view route and no audio or film route

#### Scenario: A public file with a cookie is checked

- **WHEN** the check requests a public image file twice with a made-up session cookie
- **THEN** it fails unless the second response is an edge hit

### Requirement: A visitor's poll reload and a public status read are shared at the edge for three seconds

A topic page's poll reload with no session that responds 200, and a status read of a subject on a public Topic requested
without credentials, SHALL be sent with `Cache-Control: no-cache` and `CDN-Cache-Control: max-age=3`, with no
`stale-while-revalidate`. Any other response from those routes SHALL be sent with `Cache-Control: private, no-cache` and
no `CDN-Cache-Control`. If the zone's plan does not honor so short a lifetime, each status read SHALL still cost the
origin a key read.

#### Scenario: Visitors watching one Scan share one response

- **WHEN** 200 visitors poll one public Topic's Scan status inside three seconds
- **THEN** the origin serves the status once, and the edge serves the rest

#### Scenario: A private Topic's status is never shared

- **WHEN** a member polls the status of a Scan on a private Topic with their session
- **THEN** the response has `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: A signed-in poll reload is private

- **WHEN** a signed-in user's page sends a poll reload of a topic page with its session cookie
- **THEN** the response has `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

## MODIFIED Requirements

### Requirement: A signed-out page and the signed-out feed are shared at the edge for a minute

The api, started as the `app` service or the `web` service, SHALL send a page the ui's server renders, a blog page, a
release page, and `/api/topic-feed` with `Cache-Control: no-cache`, `CDN-Cache-Control: max-age=60,
stale-while-revalidate=60, stale-if-error=120`, and `Cache-Tag: rendered` if the response is a 200 or a permanent
redirect (301 or 308), the request has no Better Auth session cookie and no `Authorization` header, and the response
sets no cookie. `/api/home` and each page read SHALL be sent the same way with the tags of their page, a page read only
once a tag can purge it and Cloudflare's rule names its path, as this capability states for a page read. Every other
response from those routes SHALL be sent with `Cache-Control: private, no-cache` and no `CDN-Cache-Control`. The browser
always revalidates, and only the edge shares a copy. A permanent redirect is shared so a stale link in circulation, such
as a topic's old slug, costs the origin one response a minute instead of one per click. The edge MAY serve a shared copy
stale for up to two minutes while the origin responds with an error, so a shed render's 503 reaches a visitor only where
the edge has no copy.

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

#### Scenario: The web service sends the same headers

- **WHEN** path routing sends a public topic page to the `web` service and a request without a session cookie renders it
- **THEN** the response has the headers and the `rendered` tag that the `app` service sends for the same request

#### Scenario: A page read is shared like its page

- **WHEN** a request without a session cookie reads a public profile's page read, once the profile tag can purge it and
  Cloudflare's rule names its path
- **THEN** the response has the shared `CDN-Cache-Control` and the tags `rendered` and that profile's own, and the same
  read with a session cookie has `Cache-Control: private, no-cache`

### Requirement: The edge caches by the origin's headers and bypasses a signed-in request

Cloudflare SHALL treat as cacheable only the page paths, the discovery files, the client bundle, the docs,
`/api/topic-feed`, `/api/home`, the page read paths, the counts paths after `/api/counts/`, the status paths after
`/api/status/`, a topic page's poll reload, the Dashboard paths after `/api/dashboards/`, and the versioned public file
paths, and SHALL cache each one only as long as the origin's headers allow, bypassing any response without a
`Cache-Control` header. The versioned public file paths are the image files of a Topic, a podcast episode, a film, and a
Topic Post, a Topic Post's body images, the avatars and team avatars, the favicons, the podcast covers, the link preview
images, and the cards. It SHALL bypass its cache for every request with a Better Auth session cookie except a request
for a versioned public file path, which SHALL be served from the edge whatever the cookie, because the origin already
sends a public file with `CDN-Cache-Control` and a file of a Topic that is not public with `Cache-Control: private`,
which the edge never stores. Every other api route, every SSE stream, `/mcp`, and every response that sets a cookie
SHALL never be cached at the edge. The zone SHALL use SSL/TLS Full (strict), and no security rule SHALL challenge a
request under `/.well-known/acme-challenge/`.

#### Scenario: A signed-in request is never served from the edge

- **WHEN** a request for a page or for an api route outside the versioned public file paths has a Better Auth session
  cookie
- **THEN** Cloudflare bypasses its cache and the origin serves the request

#### Scenario: An authenticated api route is never cached

- **WHEN** a request reaches an api route other than the signed-out feed, the home read, a page read, the counts, a
  status read, a topic page's poll reload, a Dashboard path, or a versioned public file path
- **THEN** Cloudflare passes it to the origin and caches nothing

#### Scenario: A certificate renewal reaches the origin

- **WHEN** the certificate authority requests a path under `/.well-known/acme-challenge/`
- **THEN** no security rule challenges it and no cache rule caches it

#### Scenario: A signed-in browser's public image is an edge hit

- **WHEN** a signed-in browser requests a public Topic's image file or a Source's favicon that the edge holds
- **THEN** the edge serves it, and the origin reads no session, counts no limit, and streams no file

#### Scenario: A private Topic's image never reaches a second account

- **WHEN** the owner of a private Topic requests its image file with their session cookie
- **THEN** the origin sends it with `Cache-Control: private`, the edge stores nothing, and no other account is ever
  served that response

### Requirement: A versioned image is immutable only at its current version

An avatar route, the team avatar route, and a card route SHALL send a stored image with `Cache-Control: public,
max-age=31536000, immutable` and `CDN-Cache-Control: max-age=86400` if `v` equals the current version. An avatar route
and the team avatar route SHALL send it with `Cache-Control: public, max-age=60` otherwise. A card request whose query
string is anything but the current `v` SHALL be redirected to the card's url at its current version, so a changing query
string never reads storage or draws a card. A provider photo redirect SHALL be sent with `Cache-Control: public,
max-age=3600`.

#### Scenario: The current version is immutable

- **WHEN** an avatar is requested at its current version
- **THEN** it is served `immutable` for a year, and the edge caches it for a day

#### Scenario: An old version gets the current image briefly

- **WHEN** an avatar is requested at a version from before its latest upload
- **THEN** the current image is served with `Cache-Control: public, max-age=60`

#### Scenario: A card without a version is not immutable

- **WHEN** a card is requested with no `v`
- **THEN** the response redirects to the card's url at its current version, and no image is sent as immutable without
  the current `v`

#### Scenario: A changing query string costs no card read

- **WHEN** one address requests a card with `?x=1`, then `?x=2`, and so on
- **THEN** each response is the redirect to the versioned url, which the edge holds, and none reads the card from
  storage

### Requirement: A deleted avatar is purged from the edge by its tag

A user avatar response SHALL include `Cache-Tag: user-avatar:<userId>`, and a team avatar response `Cache-Tag:
team-avatar:<teamId>`, at every version. The purge SHALL take any list of tags, and the release purge SHALL keep
clearing `rendered` through it. Once an account close or a team deletion has committed, the api SHALL purge that
account's or team's tag once, reading `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` from its own environment. A failed
purge SHALL be reported, a purge skipped for unset settings SHALL be logged, and neither SHALL fail the deletion. A
purge that Cloudflare answers with a 429 SHALL wait as long as the response's `Retry-After` names and try once more, and
nothing else retries a purge. A failed purge's report SHALL hold one fixed message with the tags beside it and never in
it, so repeated failures count as one report under the report limit. The day-long edge lifetime bounds a missed one.
Share previews, podcast covers, chat room preview images, and browser caches are out of scope.

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

#### Scenario: A rate-limited purge is tried once more

- **WHEN** Cloudflare answers a purge with a 429 and a `Retry-After`
- **THEN** the purge waits that long and sends the request once more, and a second failure is reported under the one
  fixed message

### Requirement: A page url with a click id redirects to the url without it

A page request whose query has an ad or social platform's click id, such as `fbclid`, `gclid`, `msclkid`, `twclid`,
`ttclid`, or `igshid`, or an email or ad platform's id for one recipient, `_hsenc`, `_hsmi`, `mkt_tok`, `_bhlid`,
`ck_subscriber_id`, or `yclid`, SHALL be redirected permanently to the same path and query without those ids, which is
the url the edge has cached. A page the ui's server renders, a blog page, and a release page SHALL each redirect so.
Campaign parameters such as `utm_source` SHALL be kept. The redirect SHALL stay on this site, and a visitor's redirect
SHALL be shared at the edge like any other permanent redirect.

#### Scenario: A shared link with a click id

- **WHEN** a visitor opens `/topics/abc?fbclid=x&utm_source=newsletter`
- **THEN** they are redirected permanently to `/topics/abc?utm_source=newsletter`

#### Scenario: A newsletter's recipient id is stripped

- **WHEN** two readers of one newsletter open `/topics/abc?mkt_tok=a` and `/topics/abc?mkt_tok=b`
- **THEN** both are redirected permanently to `/topics/abc`, and the edge serves both from one copy
