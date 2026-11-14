## MODIFIED Requirements

### Requirement: One per-caller rate limit covers MCP and the chat
The api SHALL apply one rate limiter to both MCP routes and to the private chat turn `POST` routes, and SHALL count an
MCP protocol message apart from a tool call.

#### Scenario: Count and limit a caller request

- **WHEN** an MCP or private chat request is handled
- **THEN** The limiter is a fixed window of one minute with one limit for every caller, keyed by the user a session or
  an accepted bearer token names, else by the client address, else by one shared bucket. A `tools/call` message and a
  private chat turn SHALL count against that limit. Every other MCP protocol message, `initialize`, a notification,
  `tools/list`, `resources/list`, and `resources/read`, SHALL count in a window of its own under a limit far above it,
  keyed the same way, so a handshake or an MCP view's read never spends a tool call. The client address SHALL be the
  `cf-connecting-ip` header if the hop that reported the client is a trusted Cloudflare address, so a request relayed
  through a Cloudflare Worker is keyed by the Workers address and never resolves to no address. Any other request's
  client address SHALL be resolved by Better Auth's own `getIp` with the same options object Better Auth is configured
  with: the rightmost `x-forwarded-for` entry outside every range in `TRUSTED_PROXIES`. Better Auth SHALL be given the
  same address, so Better Auth and the limiter always name the same client. Each process SHALL check the first request
  that came through Cloudflare, and warn if `TRUSTED_PROXIES` is set and that request resolves to no client address or
  to an internal one. A token that resolves to no user is a visitor and never a key of its own. A request past the limit
  SHALL be rejected with 429 and perform no work. The counts SHALL live in Redis through the Redis store's fixed-window
  counter, keyed the same way, so every api replica counts against one window and no process holds a count of its own
  while Redis answers. While Redis is unreachable the counter counts in each replica's memory, so a caller is bounded at
  the limit per replica and the limiter never fails closed.

#### Scenario: A visitor past the limit is rejected
- **WHEN** one client address sends more MCP tool calls in a minute than the limit
- **THEN** the calls past it are rejected with 429 and run no read

#### Scenario: The chat shares the limit
- **WHEN** a user posts more chat turns in a minute than the limit
- **THEN** the turns past it are rejected with 429 and spend nothing

#### Scenario: The visitor behind a Cloudflare hop is the client
- **GIVEN** `TRUSTED_PROXIES` lists Cloudflare's ranges
- **WHEN** a request arrives with `x-forwarded-for: 203.0.113.7, 172.70.1.1` and `cf-connecting-ip: 203.0.113.7`
- **THEN** the limiter keys it by `203.0.113.7`

#### Scenario: A forged left entry is ignored
- **GIVEN** `TRUSTED_PROXIES` lists Cloudflare's ranges
- **WHEN** a request arrives with `x-forwarded-for: 198.51.100.9, 203.0.113.7, 172.70.1.1` and `cf-connecting-ip:
  203.0.113.7`
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
- **THEN** the api logs one warning with the request's x-forwarded-for header, and checks no other request for the rest
  of the process

#### Scenario: Two replicas share one window
- **WHEN** one caller's requests are split across two api processes inside one minute
- **THEN** the requests past the limit are rejected whichever process receives them, because both count in Redis

#### Scenario: Redis down allows the request
- **WHEN** Redis is unreachable and a caller sends an MCP request inside the limit
- **THEN** the request is allowed, and no error reaches the caller

#### Scenario: Redis down bounds one replica
- **WHEN** Redis is unreachable and one caller sends 31 MCP tool calls inside a minute to one replica
- **THEN** the 31st is rejected with 429

#### Scenario: A handshake spends no tool call

- **WHEN** a client with no token sends `initialize`, `tools/list`, and four `resources/read` messages, then 30 tool
  calls, inside one minute
- **THEN** all 30 tool calls are handled, because the protocol messages counted in their own window

#### Scenario: A request relayed through a Worker is keyed by the Workers address

- **GIVEN** `TRUSTED_PROXIES` lists Cloudflare's ranges
- **WHEN** a request arrives through a Cloudflare Worker with a forwarded chain whose every entry is trusted
- **THEN** the limiter keys it by the address that `cf-connecting-ip` names, never by the shared bucket and never by an
  address the Worker wrote
