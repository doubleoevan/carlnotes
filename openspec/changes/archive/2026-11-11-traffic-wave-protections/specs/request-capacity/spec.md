## ADDED Requirements

### Requirement: Every api request is limited per caller far above real use

Every `/api` request SHALL count against one limit of 1,800 requests a minute per caller, keyed by the signed-in user,
else the client address that the trusted proxies resolve, counted in Redis so every replica shares the count, and in
the replica's memory while Redis is unreachable. A request with no signed-in user whose address is unknown or internal
SHALL skip the limit. A request that a route's own limiter also counts SHALL count here too.

#### Scenario: A script is limited

- **WHEN** one signed-in user sends a 1,801st `/api` request inside a minute
- **THEN** it gets a 429 with `Retry-After` naming the seconds until the window resets, and a second user is unaffected

#### Scenario: A visitor's address is limited

- **WHEN** one external address with no session sends a 1,801st `/api` request inside a minute
- **THEN** it gets a 429, and a second address is unaffected

#### Scenario: Redis down still bounds one replica

- **WHEN** Redis is unreachable and one caller sends a 1,801st `/api` request inside a minute to one replica
- **THEN** it gets a 429 from the replica's memory count

### Requirement: A page render's own api calls are never limited

The general, topic feed, link preview, search, and social read limits SHALL skip a request with no session and no
address the trusted proxies resolve as external, which is what a page render's loopback call to the api is. A
request with a signed-in user SHALL still be counted under that user.

#### Scenario: A burst of renders calls the api freely

- **WHEN** page renders send 5,000 loopback requests to `/api/topic-feed` and other `/api` routes inside a minute
- **THEN** none gets a 429

#### Scenario: Topic Post renders no longer share the social read limit

- **WHEN** visitors' renders of 200 different Topic Post pages each read their Topic Post over loopback inside a minute
- **THEN** every read succeeds, where today the 121st gets a 429 from the shared bucket

### Requirement: A limiter no page render reaches keeps its shared count

Every api limiter keyed by user or address whose routes no page render calls SHALL keep counting a request with no
signed-in user and no external address in one shared count, so a missed trusted proxy hop never leaves it unlimited.

#### Scenario: The signup gate stays bounded on a missed proxy hop

- **WHEN** the trusted proxies miss a hop and visitors send an 11th app signup challenge inside a minute
- **THEN** it gets a 429 from the shared count

### Requirement: Some api routes skip the general limit

The general limit SHALL skip the health checks, every `/api/auth/*` path, every `/api/webhooks/*` path, the podcast
feeds and their podcast episode files, the podcast covers, and `/api/unsubscribe`. These paths are fetched by
aggregators, crawlers, mail scanners, or signed senders from shared addresses, or keep the limits they already have.

#### Scenario: A podcast app's feed fetches are never limited

- **WHEN** one address fetches private podcast feeds 2,000 times inside a minute
- **THEN** none gets a 429 from the general limit

#### Scenario: A webhook is never limited

- **WHEN** a payment provider posts its 1,201st webhook inside a minute from one address
- **THEN** it is handled

### Requirement: Some api files skip the general limit on a read

On a GET or a HEAD alone, the general limit SHALL skip a Topic's podcast feed, a podcast episode's audio, video,
captions, chapters, transcript, and preview card, a Topic Post Discussion's audio, and the `preview.png` share cards,
each matched on its own route. Podcast apps and social crawlers fetch these from shared addresses.

#### Scenario: A crawler's share card fetches are never limited

- **WHEN** one address fetches topic share cards 2,000 times inside a minute
- **THEN** none gets a 429 from the general limit

#### Scenario: A look-alike path is counted

- **WHEN** a caller sends `GET /api/topics/card.png` or a `POST` to a podcast episode's audio path
- **THEN** the general limit counts it

### Requirement: The topic feed is limited per caller

`GET /api/topic-feed` SHALL have its own limit of 120 requests a minute per caller, keyed by the signed-in user, else
the client address, counted in Redis under its own rate limit window and in memory while Redis is unreachable, so a
signed-in request that bypasses the edge cache and a visitor's request that misses it are both bounded.

#### Scenario: A feed loop is limited

- **WHEN** one caller sends a 121st topic feed request inside a minute
- **THEN** it gets a 429 with `Retry-After`, and no feed is built for it

#### Scenario: The feed limit falls back to memory

- **WHEN** Redis is unreachable and one caller sends a 121st topic feed request inside a minute to one replica
- **THEN** it gets a 429

### Requirement: A finding's link preview is limited per caller

`GET /api/topic-findings/:id/link-preview` SHALL have its own limit of 120 requests a minute per caller, keyed by the
signed-in user, else the client address, counted in Redis under its own rate limit window and in memory while Redis is
unreachable, so no caller can make the api fetch pages for previews without bound.

#### Scenario: A preview loop is limited

- **WHEN** one caller sends a 121st link preview request inside a minute
- **THEN** it gets a 429 with `Retry-After`, and no page is fetched for it

#### Scenario: The preview limit falls back to memory

- **WHEN** Redis is unreachable and one caller sends a 121st link preview request inside a minute to one replica
- **THEN** it gets a 429

### Requirement: A limited api request gets a plain 429 that no cache keeps

A request rejected by the general, topic feed, or link preview limit SHALL get a 429 with `{ error: "rate limited" }`,
`Retry-After` naming the seconds until the window resets, and `Cache-Control: private, no-cache`. These limits SHALL
set no rate limit headers on any response, so a response the edge shares never shows one caller's count. Neither app
SHALL show any notice, warning, or copy for these limits.

#### Scenario: A limited response is not cached

- **WHEN** a visitor's topic feed request is limited
- **THEN** the 429 sends `Cache-Control: private, no-cache`, and the edge keeps serving its own copy to other visitors

#### Scenario: An allowed response shows no count

- **WHEN** a visitor's topic feed request is allowed
- **THEN** the response sends no `RateLimit` header
