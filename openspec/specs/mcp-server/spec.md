# mcp-server Specification

## Purpose
Expose authorized CarlNotes research and account actions to AI clients through MCP, with stable tool contracts, OAuth, interactive cards, and explicit privacy boundaries.

## Requirements

### Requirement: One MCP server serves the feed over streamable HTTP
The api SHALL serve a Model Context Protocol server over streamable HTTP at `/mcp`, in the same process and origin as
the app, using the official v2 MCP server SDK, `@modelcontextprotocol/server`, through its web-standard transport
inside a Hono route.

#### Scenario: Transport and tool inventory

- **WHEN** an MCP client sends a request
- **THEN** The server SHALL run stateless. Each request builds its own server and transport bound to the resolved caller, and no session id is issued. The tool list SHALL be the same for every caller. Identity changes what a call returns, never which tools exist. The tools SHALL be the four reads `list_topics`, `read_topic_feed`, `search_topic_findings`, and `search`, the four per-user writes `mark_finding_consumed`, `rate_finding`, `bookmark_finding`, and `follow_topic`, and the three Topic Tools `edit_topic`, `suggest_sources`, and `create_topic`.

#### Scenario: An anonymous client initializes and lists tools
- **WHEN** a client with no credentials sends an initialize request and then a tools list request to `/mcp`
- **THEN** both succeed, and the tool list names the four read tools, the four per-user writes, and the three Topic
  Tools, and no `update_topic_prompt`, `update_topic_fields`, `add_source`, or `remove_source`

#### Scenario: The tool list does not change with identity
- **WHEN** an authenticated client lists tools
- **THEN** it receives the same tools an anonymous client does, in the same order

### Requirement: A topic-bound route runs the same handler
The api SHALL serve `/mcp/t/<topicId>` through the same handler as `/mcp`, with the path's Topic bound for the connection.

#### Scenario: Use the bound Topic

- **WHEN** an MCP client calls a tool through the Topic-bound endpoint
- **THEN** On the bound route every tool's `topic_id` argument SHALL be optional and default to the bound Topic, the two draft tools that take no `topic_id` SHALL behave as they do on `/mcp`, `list_topics` SHALL return that Topic alone, and a call naming a different Topic SHALL be rejected with a message. The path segment SHALL be the topic id, the same identifier the topic page and its RSS feed use.

#### Scenario: A bound connection reads without naming the Topic
- **WHEN** a client connected to `/mcp/t/<id>` calls the feed read with no `topic_id`
- **THEN** it receives that Topic's feed

#### Scenario: A bound connection cannot reach another Topic
- **WHEN** a client connected to `/mcp/t/<id>` calls any tool with a different `topic_id`
- **THEN** the call is rejected with a message saying this server is bound to one Topic, and nothing is read or written

#### Scenario: A bound private Topic reads as missing to a visitor
- **WHEN** an anonymous client connects to `/mcp/t/<id>` for a private or invite Topic
- **THEN** every read behaves as if the Topic did not exist

### Requirement: A caller resolves to a visitor or a user before any read
The server SHALL resolve each request's caller once. A bearer token the OAuth lookup accepts makes it a user, and anything else makes it a visitor. A visitor SHALL read public Topics only, through the same visibility rules the pages use. A user SHALL read every Topic they can access under those rules, with the invite activation gate applied. No read SHALL run a per-user query against a null user.

#### Scenario: A visitor lists public Topics only
- **WHEN** an anonymous client calls `list_topics` on `/mcp`
- **THEN** the result holds public Topics with enough kept Findings to be shown, and no private or invite Topic

#### Scenario: A user lists what they can access
- **WHEN** an authenticated client calls `list_topics`
- **THEN** the result holds the user's own Topics, the Topics they subscribe to, the Topics their Teams hold, and the public Topics, each once

#### Scenario: A hidden Topic reads as missing
- **WHEN** a user calls a read on a Topic the visibility rules do not grant them
- **THEN** the result is the same as for a Topic id that matches nothing

### Requirement: The visitor path skips the per-user steps
A visitor's feed read SHALL be built without the consumed and bookmark joins and SHALL return Findings in stored relevance order with no per-user step. A user's feed read SHALL include each Finding's consumed and bookmarked flags for that user. A visitor's result SHALL omit per-user fields.

#### Scenario: A visitor's findings have no per-user fields
- **WHEN** an anonymous client reads a public Topic's feed
- **THEN** each Finding includes its title, url, relevance score, relevance explanation, source, and dates, and no consumed or bookmarked field

#### Scenario: A user's findings include their flags
- **WHEN** an authenticated client reads a Topic's feed after marking one Finding consumed
- **THEN** that Finding's consumed flag is true and the rest are false

### Requirement: OAuth on the transport, optional until a tool needs an account
The app SHALL act as the OAuth authorization server for its MCP server through Better Auth's `mcp` plugin from
`@better-auth/mcp`, with the `jwt` plugin signing its access tokens.

#### Scenario: Connect and authorize an MCP client

- **WHEN** a client connects to MCP or starts its authorization flow
- **THEN** It SHALL serve `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` at the origin root, the first also at the issuer path after it, and every protected resource path, the topic-bound `/mcp/t/<topicId>` included, SHALL return the one protected resource metadata naming `/mcp` as the resource. A client SHALL register by dynamic client registration, which takes no credential, or by a client metadata document, and SHALL use PKCE. An authorize request that names no resource SHALL ask for `/mcp`, so every access token is a JWT bound to `/mcp`, and the server SHALL verify it in-process against the auth server's signing keys, with a DPoP-bound token's proof checked too. An unauthenticated connection SHALL work. A tool that needs an account, called by a visitor, SHALL return an ordinary tool result whose text names what connecting an account enables and that the client's connect control does it, and SHALL NOT respond with an HTTP 401. Signing in on the way to an authorize request SHALL return the user to that authorize request with its whole signed query, and consent SHALL render on the app's own page naming the client, which SHALL send that signed query back with the user's answer.

#### Scenario: Discovery documents are served at the root
- **WHEN** a client fetches `/.well-known/oauth-authorization-server`
- **THEN** it receives the authorization, token, and registration endpoints under the app's auth path, after `/oauth2`

#### Scenario: A visitor is told what an account enables
- **WHEN** an anonymous client calls `rate_finding`
- **THEN** the result's text says the tool needs a connected account and that reading and searching public topics work
  without one, and the connection stays usable

#### Scenario: Sign-in returns to the authorize step
- **WHEN** a visitor is sent to the login page by an authorize request
- **THEN** after signing in they land back on the authorize request with every OAuth parameter and its signature intact,
  then on the consent page

#### Scenario: A token resolves to its user
- **WHEN** a client sends an unexpired access token the auth server signed for `/mcp`
- **THEN** the caller resolves to that token's user and reads as that user would

#### Scenario: A topic-bound path reads the MCP server's protected resource metadata
- **WHEN** a client fetches `/.well-known/oauth-protected-resource/mcp/t/<topicId>`
- **THEN** it receives the protected resource metadata naming `/mcp` as the resource, so its token works on the
  topic-bound path too

### Requirement: The read tools and the consumed write reuse the existing reads and writes
The server SHALL expose `list_topics`, `read_topic_feed`, `search_topic_findings`, and `mark_finding_consumed`.

#### Scenario: Read Findings and mark them consumed

- **WHEN** a client invokes a feed, Finding search, or consumed-state tool
- **THEN** The feed read SHALL return Findings with their relevance scores and relevance explanations through the same read the topic page uses. Search SHALL rank a Topic's Findings against the query through the same embedding instruction and pgvector ordering the chat retrieval uses, restricted to Resources embedded by the current model, and SHALL return Findings with their explanations and no stored Resource text. Marking consumed SHALL route through the existing consume write and its visibility check, and SHALL need an account.

#### Scenario: A feed read includes explanations
- **WHEN** a client reads a Topic's feed
- **THEN** every Finding in the result includes its full relevance explanation

#### Scenario: A listed topic names its sources with their ids
- **WHEN** a client lists topics
- **THEN** each Topic includes its ready Sources, each with its id and label

#### Scenario: Search ranks over the existing index
- **WHEN** a client searches a Topic with a query
- **THEN** the result lists that Topic's Findings closest to the query by cosine distance over `resources.embedding`, each with its explanation, and no other Topic's Findings

#### Scenario: A visitor cannot mark consumed
- **WHEN** an anonymous client calls `mark_finding_consumed`
- **THEN** the result says an account is needed and no consumed row is written

### Requirement: Rating and bookmarking need an account and the visitor is told so
The server SHALL expose `rate_finding` and `bookmark_finding`, routed through the existing rating and bookmark writes and their own permission checks. A visitor's call SHALL return the connect-an-account result.

#### Scenario: A user rates through the existing rule
- **WHEN** an authenticated client rates a Finding on a Topic the user may rate
- **THEN** the rating is written with the same snapshot the page's rating writes, and a user who may not rate it is rejected

#### Scenario: A bookmark follows the owner-or-member rule
- **WHEN** an authenticated client bookmarks a Finding
- **THEN** it succeeds for the Topic's owner or an active member of a holding Team and is rejected for anyone else

### Requirement: The visitor path spends from one public key
The visitor path's only model call SHALL be the search embedding, and it SHALL run on `LITELLM_PUBLIC_KEY`, a budgeted LiteLLM virtual key the operator provisions. When that key's budget is spent, the search tool SHALL return a message that the public budget is spent this month and that an account keeps searching. When the key is unset, the search tool SHALL return a message that search needs an account, and every other tool SHALL work. A user's search SHALL embed on their own key.

#### Scenario: A spent public key returns a message
- **WHEN** LiteLLM rejects a visitor's search embedding for a spent budget
- **THEN** the tool result says the public budget is spent this month and that an account keeps searching, and the call is not an error

#### Scenario: A user's search bills their own key
- **WHEN** an authenticated client searches
- **THEN** the embedding runs on that user's LiteLLM key

### Requirement: One per-caller rate limit covers MCP and the chat
The api SHALL apply one rate limiter to both MCP routes and to the private chat turn `POST` routes.

#### Scenario: Count and limit a caller request

- **WHEN** an MCP or private chat request is handled
- **THEN** The limiter is a fixed window of one minute with one limit for every caller, keyed by the user a session or an accepted bearer token names, else by the client address, else by one shared bucket. The client address SHALL be resolved by Better Auth's own `getIp` with the same options object Better Auth is configured with: the rightmost `x-forwarded-for` entry outside every range in `TRUSTED_PROXIES`, so Better Auth and the limiter always name the same client. Each process SHALL check the first request that came through Cloudflare, and warn if `TRUSTED_PROXIES` is set and that request resolves to no client address or to an internal one. A token that resolves to no user is a visitor and never a key of its own. A request past the limit SHALL be rejected with 429 and perform no work. The counts SHALL live in Redis through the Redis store's fixed-window counter, keyed the same way, so every api replica counts against one window and no process holds a count of its own while Redis answers. While Redis is unreachable the counter counts in each replica's memory, so a caller is bounded at the limit per replica and the limiter never fails closed.

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
- **THEN** the api logs one warning with the request's x-forwarded-for header, and checks no other request for the rest
  of the process

#### Scenario: Two replicas share one window
- **WHEN** one caller's requests are split across two api processes inside one minute
- **THEN** the requests past the limit are rejected whichever process receives them, since both count in Redis

#### Scenario: Redis down allows the request
- **WHEN** Redis is unreachable and a caller sends an MCP request inside the limit
- **THEN** the request is allowed, and no error reaches the caller

#### Scenario: Redis down bounds one replica
- **WHEN** Redis is unreachable and one caller sends 31 MCP requests inside a minute to one replica
- **THEN** the 31st is rejected with 429

### Requirement: Results fit the client's limit, Findings whole or not at all
Every list result but `search`'s SHALL paginate with an opaque cursor and include a next cursor when more remains.

#### Scenario: Pack and page complete results

- **WHEN** the server prepares a list result
- **THEN** A page SHALL be packed under a character budget well inside a client's result limit of about 30,000 tokens, adding Findings in order until the next would overflow and always including at least one. A Finding SHALL never be returned with a truncated relevance explanation. Trimming returns fewer Findings. Results SHALL include structured content beside their text. `search` SHALL page by number, with the page and page size the `/search` url takes, and its largest page, 50 rows of names, links, and counts, SHALL fit inside the same budget.

#### Scenario: A large feed pages
- **WHEN** a Topic holds more Findings than fit one page
- **THEN** the first result holds as many whole Findings as fit and a next cursor, and following the cursor returns
  the rest

#### Scenario: Trimming moves a whole Finding to the next page
- **WHEN** the next Finding's full explanation would overflow the page's character budget
- **THEN** the page ends before it and that Finding leads the next page, intact

#### Scenario: A feed past the topic page's read limit still pages to its end
- **WHEN** a Topic has more Findings than the topic page's read limit
- **THEN** following the cursor returns every Finding

#### Scenario: Search pages by number
- **WHEN** a client calls `search` with `page: 2` and `size: 10`
- **THEN** the result holds the second ten rows, the row count, and the page count, and no cursor

### Requirement: The server creates Topics and suggests Sources for a connected account
The server SHALL expose `create_topic` and `suggest_sources`.

#### Scenario: Create or suggest through the existing Topic Tools

- **WHEN** a client calls create_topic or suggest_sources
- **THEN** Each SHALL return the connect-an-account result to a visitor. `create_topic` SHALL take a name, a prompt, Sources as source option and value pairs, and invite emails, run the `createTopicFromDraft` Topic Tool, and return the new Topic's id and name, annotated `destructiveHint: true`. `suggest_sources` SHALL take a name and a prompt, run the `suggestTopicDraftSources` Topic Tool, and return the suggestions, annotated `readOnlyHint: false`, conservative `destructiveHint: true`, and `openWorldHint: true` because it consumes the account's suggestion allowance.

#### Scenario: An agent makes a Topic
- **WHEN** an authenticated client calls `create_topic` within the account's limits
- **THEN** the Topic exists with a first Prompt Version of origin `mcp`, its first Scan is open, and the result names its id

#### Scenario: A visitor cannot create
- **WHEN** an anonymous client calls `create_topic`
- **THEN** the result says an account is needed and nothing is written

### Requirement: create_topic takes a visibility
`create_topic` SHALL accept an optional `visibility` of `public`, `invite`, or `private`, defaulting to `invite`, and create the Topic with it.

#### Scenario: An agent makes a private Topic
- **WHEN** an authenticated client calls `create_topic` with `visibility: "private"`
- **THEN** the Topic exists with visibility `private`

#### Scenario: An agent leaves the visibility out
- **WHEN** an authenticated client calls `create_topic` with no `visibility`
- **THEN** the Topic is shared by invite

### Requirement: create_topic takes a team
`create_topic` SHALL accept an optional `team` with a team id and name, add the created Topic to that team when the connected account leads it, and name a rejected add in the result beside the created Topic.

#### Scenario: An agent makes a Topic for a leader team
- **WHEN** an authenticated client calls `create_topic` with the id of a team the account leads
- **THEN** the Topic exists and is on that team

#### Scenario: An agent names a team the account does not lead
- **WHEN** an authenticated client calls `create_topic` with a team the account does not lead
- **THEN** the Topic exists, and the result says it was not added to the team

### Requirement: The search tool runs the site's search
The server SHALL expose `search`, taking the same `q`, `kinds`, `sort`, `page`, and `size` the `/search` url takes,
validated by the same contract, and returning the site search's page for the caller: a visitor's public results, or a
user's results under their access.

#### Scenario: Return the authorized site search page

- **WHEN** a client calls search
- **THEN** Each row SHALL include its absolute url on the site, and the result SHALL include the absolute `/search` url of the same search. The tool SHALL count one hit against the search rate limit under the caller's rate limit key and SHALL return a message, not a result, to a caller past it. It SHALL be annotated `readOnlyHint: true`, and its text SHALL list each row's kind, name, and url.

#### Scenario: An agent finds a team by name
- **WHEN** an anonymous client calls `search` with `q: "orbit"` and `kinds: ["teams"]`
- **THEN** the result lists the public teams named "orbit" with their urls, the same rows `/search?q=orbit&kinds=teams`
  shows a visitor

#### Scenario: A user's search includes their private topics
- **WHEN** an authenticated client searches the name of the user's private Topic
- **THEN** that Topic is listed, and an anonymous client's same search does not list it

#### Scenario: The search tool is read-only
- **WHEN** a client lists tools
- **THEN** `search` has a read-only hint

### Requirement: The server follows a topic for a connected account
The server SHALL expose `follow_topic`, taking a topic id and `is_following`, and calling the topic page's subscribe
write for the connected account, with `mcp` as the subscription's source.

#### Scenario: Apply the subscription contract

- **WHEN** a client calls follow_topic
- **THEN** A visitor's call SHALL return the connect-an-account result. A Topic the account may not view, a private Topic it does not own, and an owner unfollowing their own Topic SHALL be rejected with a message, as the page's write rejects them. On the topic-bound route the topic id SHALL default to the bound Topic. Its name, description, and argument SHALL say follow, and it SHALL be annotated `readOnlyHint: false`, conservative `destructiveHint: true`, and `idempotentHint: true`.

#### Scenario: An agent follows a public topic
- **WHEN** an authenticated client calls `follow_topic` with `is_following: true` on a public Topic
- **THEN** the account follows the Topic, its follower count includes them, and the event names `mcp` as the source

#### Scenario: An agent unfollows
- **WHEN** an authenticated client calls `follow_topic` with `is_following: false` on a Topic it follows
- **THEN** the account no longer follows the Topic

#### Scenario: A visitor cannot follow
- **WHEN** an anonymous client calls `follow_topic`
- **THEN** the result says an account is needed and nothing is written

#### Scenario: An owner cannot unfollow their own topic
- **WHEN** a Topic's owner calls `follow_topic` with `is_following: false` on it
- **THEN** the result says the owner always follows their own Topic, and nothing changes

### Requirement: MCP rejects an unapproved Origin before processing the request

Both `/mcp` and `/mcp/t/<topicId>` SHALL reject every request with an unapproved Origin with HTTP 403 before resolving credentials, consuming the caller's quota, or dispatching tools. The same policy SHALL cover every HTTP method on these endpoints. A missing Origin SHALL proceed through ordinary transport and authorization rules.

#### Scenario: A foreign origin is rejected on both endpoints

- **WHEN** a request to either endpoint includes `Origin: https://attacker.example`, with or without valid credentials
- **THEN** it receives HTTP 403 and no tool runs
- **AND** the rejection precedes authentication lookup and quota consumption

#### Scenario: A server-side client omits Origin

- **WHEN** a client sends valid initialization, tool-list, or public-read requests without Origin to either endpoint
- **THEN** the requests succeed under the existing visitor rules
- **AND** an account-only call still requires a connected account

#### Scenario: An allowed origin does not grant account permissions

- **WHEN** a visitor sends an account-only call from an allowed Origin
- **THEN** the response remains the existing connect-account tool result and no write occurs

#### Scenario: Origin validation covers methods and preflights

- **WHEN** POST, GET, HEAD, OPTIONS, or DELETE reaches either endpoint with an unapproved Origin
- **THEN** it receives HTTP 403 before transport handling
- **AND** an allowed or missing Origin retains the transport's normal method behavior

### Requirement: MCP origins are explicit deployment origins

The allowlist SHALL include `https://carlnotes.com` and the configured application origin. The unconfigured local deployment SHALL allow `http://localhost:5173`. Matching SHALL use a complete serialized HTTP(S) origin, including scheme and port. Empty, opaque, malformed, multi-origin, or unlisted values SHALL fail. Request Host, forwarded headers, client names, and OAuth redirects SHALL NOT expand the allowlist.

#### Scenario: Hosted and configured development origins work

- **WHEN** a valid request supplies `https://carlnotes.com` or the configured application's serialized origin
- **THEN** Origin validation allows it
- **AND** `http://localhost:5173` works when it is the configured or fallback local application origin

#### Scenario: An origin lookalike is rejected

- **WHEN** Origin is `null`, empty, `https://carlnotes.com.attacker.example`, `http://carlnotes.com`, or an unlisted port
- **THEN** the response is HTTP 403

#### Scenario: Non-origin URLs and multiple origins are rejected

- **WHEN** Origin contains credentials, a path, query, fragment, or multiple space- or comma-separated origins
- **THEN** the response is HTTP 403 even if one hostname is allowed

#### Scenario: OAuth pages keep their existing policy

- **WHEN** a request reaches `/mcp/consent`, `/api/auth/`, or an OAuth discovery document
- **THEN** the new MCP endpoint guard does not replace that route's existing behavior

### Requirement: Every advertised tool has a directory-safe annotation contract

Every advertised tool SHALL have a nonempty title and explicit boolean safety hints. The four read tools SHALL use `readOnlyHint: true`. The seven account tools SHALL use `readOnlyHint: false` and conservative `destructiveHint: true`, including Source suggestions that consume allowance. Tool names, argument schemas, results, authorization, and edit confirmations SHALL remain unchanged.

#### Scenario: Visitor and connected clients list the same annotated tools

- **WHEN** either identity lists tools on either endpoint
- **THEN** all eleven tools have titles and the expected safety hints
- **AND** idempotence and open-world hints remain accurate

#### Scenario: An annotation regresses

- **WHEN** a tool loses its title, supplies a non-boolean hint, marks a write read-only, or drops its required destructive hint
- **THEN** the annotation check fails with the tool name
- **AND** newly advertised tools cannot silently bypass that check

### Requirement: MCP smoke tests preserve authentication and access boundaries

The MCP smoke suite SHALL exercise both endpoints without Origin, with an allowed Origin, and with a rejected Origin. It SHALL retain OAuth registration, PKCE, sign-in, consent, token exchange, caller authorization, edit confirmation, card resource, and rate-limit checks. Invalid credentials SHALL retain visitor access only.

#### Scenario: A bearer grants only the connected account's access

- **WHEN** a smoke client exchanges an authorization code and reads its private fixture Topic
- **THEN** its bearer works on the common and matching Topic-bound endpoint
- **AND** a visitor or invalid bearer cannot read that Topic or perform account-only writes

#### Scenario: A valid token cannot bypass Origin validation

- **WHEN** a smoke client repeats its authenticated request with a foreign Origin
- **THEN** both endpoints return HTTP 403 without dispatching a tool

#### Scenario: A followed Topic becomes private

- **WHEN** an owner makes a public Topic private while another account's subscription remains active
- **THEN** that follower cannot list its current name, prompt, or Sources, or read its feed on either endpoint
- **AND** followed public Topics below the discovery threshold and invite subscriptions remain readable
- **AND** owner and active team access to private Topics remain valid

### Requirement: MCP smoke tests retain result-size and pagination checks

The smoke suite SHALL check serialized model-visible results against explicit fixture bounds derived from the existing page budget. It SHALL exercise multi-page feeds and maximum-size site search, preserve whole Findings, and verify text and structured content. Checks SHALL identify the measured representation and SHALL NOT equate character counts with universal token limits.

#### Scenario: A large feed advances through complete Findings

- **WHEN** fixtures exceed the page's item and character budgets on either endpoint
- **THEN** every page stays within its declared fixture bounds and every cursor makes progress
- **AND** traversal returns every expected Finding exactly once with its full explanation

#### Scenario: A single oversized Finding keeps the existing contract

- **WHEN** one Finding alone exceeds the packing budget
- **THEN** regression coverage preserves the existing one-whole-item exception and advances the cursor
- **AND** the validation report identifies this exception rather than claiming a universal hard size limit

#### Scenario: Site search returns its largest supported page

- **WHEN** the smoke calls site search with size 50 over enough matching fixtures
- **THEN** the response fits the declared search fixture bounds and retains numbered pagination
- **AND** card metadata and HTML resources are assessed separately from model-visible text and structured content

### Requirement: The privacy policy explains MCP data exchange

The public privacy policy SHALL explain that a connected AI app sends tool arguments and receives authorized CarlNotes results. It SHALL state that CarlNotes does not read the assistant's chat history, memory, or uploaded files through MCP. It SHALL distinguish this lack of access from content the app deliberately places in arguments, and explain that the connected app handles returned data under its own policy.

#### Scenario: A reader checks what connecting an app shares

- **WHEN** the reader opens `/privacy`
- **THEN** its MCP section describes searches, Topic identifiers, proposed edits, returned Findings and Topic data, and write outcomes
- **AND** it does not imply that the MCP connection grants access to assistant conversations or files

### Requirement: MCP credential disclosures describe working revocation paths and limits

The privacy policy SHALL describe CarlNotes-issued OAuth access and refresh tokens, sign-in and consent, and the client's revocation path. It SHALL distinguish removing a client connection from server-side revocation. It SHALL disclose that an issued JWT can remain valid until expiry, and SHALL NOT invent a CarlNotes connection-management screen or promise immediate per-token invalidation.

#### Scenario: A reader disconnects an AI app

- **WHEN** the reader follows the documented disconnect and revocation guidance
- **THEN** it explains removing the connection in that app and revoking its refresh grant through the supported OAuth endpoint
- **AND** it explains access-token expiry and links to existing account deletion and support choices

### Requirement: MCP analytics disclosures match the shipped event and retention policy

The MCP privacy section SHALL name PostHog and disclose tool name, client name, caller kind, entry point, timestamp, and success, rejection, or failure outcome. It SHALL state that tool-call analytics exclude arguments, results, and token values, and retain the existing limit of up to twelve months. Other account actions SHALL remain covered by the existing product-analytics section.

#### Scenario: A reader checks tool-call tracking

- **WHEN** the reader opens the MCP privacy section
- **THEN** it explains that tool-call events are keyed to the app name, without creating a person profile
- **AND** it does not claim that all account-action analytics are anonymous or disabled

### Requirement: MCP privacy additions preserve the complete existing policy

Adding MCP disclosures SHALL preserve the policy's existing collection, use and storage, third-party sharing, retention, account deletion, and contact coverage. Its last-updated date SHALL reflect the policy edit. No new retention system or unshipped product capability SHALL be claimed.

#### Scenario: The updated policy is reviewed

- **WHEN** the policy diff and rendered page are inspected
- **THEN** the existing coverage and support contact remain available alongside the new MCP section
- **AND** the section agrees with tested token behavior and the existing retention policy
