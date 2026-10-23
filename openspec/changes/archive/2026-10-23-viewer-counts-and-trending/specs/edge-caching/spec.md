## MODIFIED Requirements

### Requirement: The edge caches by the origin's headers and bypasses a signed-in request

Cloudflare SHALL treat as cacheable only the page paths, the discovery files, the client bundle, the docs,
`/api/topic-feed`, the counts paths after `/api/counts/`, and the avatar, team avatar, favicon, and card paths, and
SHALL cache each one only as long as the origin's headers allow, bypassing any response without a `Cache-Control`
header. It SHALL bypass its cache for every request with a Better Auth session cookie. Every other api route, every SSE
stream, `/mcp`, and every response that sets a cookie SHALL never be cached at the edge. The zone SHALL use SSL/TLS Full
(strict), and no security rule SHALL challenge a request under `/.well-known/acme-challenge/`.

#### Scenario: A signed-in request is never served from the edge

- **WHEN** a request has a Better Auth session cookie
- **THEN** Cloudflare bypasses its cache and the origin serves the request

#### Scenario: An authenticated api route is never cached

- **WHEN** a request reaches an api route other than the signed-out feed, the counts, an avatar, a favicon, or a card
- **THEN** Cloudflare passes it to the origin and caches nothing

#### Scenario: A certificate renewal reaches the origin

- **WHEN** the certificate authority requests a path under `/.well-known/acme-challenge/`
- **THEN** no security rule challenges it and no cache rule caches it

## ADDED Requirements

### Requirement: A public topic's counts are shared at the edge for thirty seconds

A counts response for a public Topic, or for a Podcast Episode of one, requested without credentials, SHALL be sent
with `Cache-Control: no-cache` and `CDN-Cache-Control: max-age=30`, with no `stale-while-revalidate` and no
`Cache-Tag`, so the edge serves one copy to every visitor for at most 30 seconds. A counts response for any other
Topic, any request with credentials, and every error SHALL be sent with `Cache-Control: private, no-cache` and no
`CDN-Cache-Control`. The browser SHALL fetch a public Topic's counts without credentials, so a signed-in person reads
the shared copy too.

#### Scenario: A public topic's counts are shared

- **WHEN** a client fetches the counts of a public Topic
- **THEN** the response includes `CDN-Cache-Control: max-age=30` and no session is read

#### Scenario: A private topic's counts are never shared

- **WHEN** a member fetches the counts of a private Topic with their session
- **THEN** the response includes `Cache-Control: private, no-cache` and no `CDN-Cache-Control`

#### Scenario: A public topic's counts fetched with credentials are not shared

- **WHEN** a request with a session cookie fetches the counts of a public Topic
- **THEN** the response includes `Cache-Control: private, no-cache` and no `CDN-Cache-Control`
