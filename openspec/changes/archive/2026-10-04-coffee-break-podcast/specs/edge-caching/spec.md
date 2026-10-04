## ADDED Requirements

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
