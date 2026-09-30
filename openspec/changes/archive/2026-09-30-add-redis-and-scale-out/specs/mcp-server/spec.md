## MODIFIED Requirements

### Requirement: One per-caller rate limit covers MCP and the chat
The api SHALL apply one rate limiter to both MCP routes and to the private chat turn `POST` routes. The limiter is a fixed window of one minute with one limit for every caller, keyed by the user a session or an accepted bearer token names, else by the client address, else by one shared bucket. The client address SHALL be resolved by Better Auth's own `getIp` with the same options object Better Auth is configured with: the rightmost `x-forwarded-for` entry outside every range in `TRUSTED_PROXIES`, so Better Auth and the limiter always name the same client. Each process SHALL check the first request that came through Cloudflare, and warn if `TRUSTED_PROXIES` is set and that request resolves to no client address or to an internal one. A token that resolves to no user is a visitor and never a key of its own. A request past the limit SHALL be rejected with 429 and perform no work. The counts SHALL live in Redis through the Redis store's fixed-window counter, keyed the same way, so every api replica counts against one window and no process holds a count of its own. While Redis is unreachable the limiter SHALL allow the request, since the limit guards spend and not data.

#### Scenario: A visitor past the limit is rejected
- **WHEN** one client address sends more MCP requests in a minute than the limit
- **THEN** the requests past it are rejected with 429 and run no read

#### Scenario: The chat shares the limit
- **WHEN** a user posts more chat turns in a minute than the limit
- **THEN** the turns past it are rejected with 429 and spend nothing

#### Scenario: The visitor behind a Cloudflare hop is the client
- **GIVEN** `TRUSTED_PROXIES` lists Cloudflare's ranges
- **WHEN** a request arrives with `x-forwarded-for: 203.0.113.7, 172.70.1.1`
- **THEN** the limiter keys it by `203.0.113.7`

#### Scenario: A forged left entry is ignored
- **GIVEN** `TRUSTED_PROXIES` lists Cloudflare's ranges
- **WHEN** a request arrives with `x-forwarded-for: 198.51.100.9, 203.0.113.7, 172.70.1.1`
- **THEN** the limiter still keys it by `203.0.113.7`

#### Scenario: A request that skips the edge resolves to its sender
- **GIVEN** `TRUSTED_PROXIES` lists Cloudflare's ranges
- **WHEN** a request reaches the origin directly with `x-forwarded-for: 172.70.1.1, 203.0.113.7`
- **THEN** the limiter keys it by `203.0.113.7`, the sender

#### Scenario: Better Auth and the limiter name the same client
- **WHEN** Better Auth and the limiter each resolve the client of one request
- **THEN** both resolve the same address

#### Scenario: A missing platform hop is reported
- **GIVEN** `TRUSTED_PROXIES` is set
- **WHEN** the first request with a `cf-ray` header resolves to no client address or to an internal one
- **THEN** the api logs one warning with the request's x-forwarded-for header, and checks no other request for the rest of the process

#### Scenario: Two replicas share one window
- **WHEN** one caller's requests are split across two api processes inside one minute
- **THEN** the requests past the limit are rejected whichever process receives them, since both count in Redis

#### Scenario: Redis down allows the request
- **WHEN** Redis is unreachable and a caller sends an MCP request
- **THEN** the request is allowed, and no error reaches the caller
