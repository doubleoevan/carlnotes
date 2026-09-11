# mcp-server Specification

## Purpose
TBD - created by archiving change mcp-server-topic-tuning. Update Purpose after archive.
## Requirements
### Requirement: One MCP server serves the feed over streamable HTTP
The api SHALL serve a Model Context Protocol server over streamable HTTP at `/mcp`, in the same process and origin as the app, using the official MCP SDK behind a Hono transport. The server SHALL run stateless. Each request builds its own server and transport bound to the resolved caller, and no session id is issued. The tool list SHALL be the same for every caller. Identity changes what a call returns, never which tools exist.

#### Scenario: An anonymous client initializes and lists tools
- **WHEN** a client with no credentials sends an initialize request and then a tools list request to `/mcp`
- **THEN** both succeed, and the tool list names the three read tools, the three per-user writes, and the five Topic Tools

#### Scenario: The tool list does not change with identity
- **WHEN** an authenticated client lists tools
- **THEN** it receives the same tools an anonymous client does, in the same order

### Requirement: A topic-bound route runs the same handler
The api SHALL serve `/mcp/t/<topicId>` through the same handler as `/mcp`, with the path's Topic bound for the connection. On the bound route every tool's `topic_id` argument SHALL be optional and default to the bound Topic, the two draft tools that take no `topic_id` SHALL behave as they do on `/mcp`, `list_topics` SHALL return that Topic alone, and a call naming a different Topic SHALL be rejected with a message. The path segment SHALL be the topic id, the same identifier the topic page and its RSS feed use.

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
The app SHALL act as the OAuth authorization server for its MCP server through Better Auth's `mcp` plugin, serving `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` at the origin root, with dynamic client registration and PKCE. An unauthenticated connection SHALL work. A tool that needs an account, called by a visitor, SHALL return an ordinary tool result whose text names what connecting an account enables and that the client's connect control does it, and SHALL NOT respond with an HTTP 401. Signing in on the way to an authorize request SHALL return the user to that authorize request with its whole query, and consent SHALL render on the app's own page naming the client.

#### Scenario: Discovery documents are served at the root
- **WHEN** a client fetches `/.well-known/oauth-authorization-server`
- **THEN** it receives the authorization, token, and registration endpoints under the app's auth path

#### Scenario: A visitor is told what an account enables
- **WHEN** an anonymous client calls `rate_finding`
- **THEN** the result's text says the tool needs a connected account and that reading and searching public topics work without one, and the connection stays usable

#### Scenario: Sign-in returns to the authorize step
- **WHEN** a visitor is sent to the login page by an authorize request
- **THEN** after signing in they land back on the authorize request with every OAuth parameter intact, then on the consent page

#### Scenario: A token resolves to its user
- **WHEN** a client sends an unexpired bearer token the plugin issued
- **THEN** the caller resolves to that token's user and reads as that user would

### Requirement: The read tools and the consumed write reuse the existing reads and writes
The server SHALL expose `list_topics`, `read_topic_feed`, `search_topic_findings`, and `mark_finding_consumed`. The feed read SHALL return Findings with their relevance scores and relevance explanations through the same read the topic page uses. Search SHALL rank a Topic's Findings against the query through the same embedding instruction and pgvector ordering the chat retrieval uses, restricted to Resources embedded by the current model, and SHALL return Findings with their explanations and no stored Resource text. Marking consumed SHALL route through the existing consume write and its visibility check, and SHALL need an account.

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
The api SHALL apply one rate limiter to both MCP routes and to the private chat turn `POST` routes. The limiter is a fixed window of one minute with one limit for every caller, keyed by the user a session or an accepted bearer token names, else by the client address the trusted proxies vouch for, the hop the last trusted proxy heard from, else by one shared bucket. A token that resolves to no user is a visitor and never a key of its own. A request past the limit SHALL be rejected with 429 and perform no work.

#### Scenario: A visitor past the limit is rejected
- **WHEN** one client address sends more MCP requests in a minute than the limit
- **THEN** the requests past it are rejected with 429 and run no read

#### Scenario: The chat shares the limit
- **WHEN** a user posts more chat turns in a minute than the limit
- **THEN** the turns past it are rejected with 429 and spend nothing

### Requirement: Results fit the client's limit, Findings whole or not at all
Every list result SHALL paginate with an opaque cursor and include a next cursor when more remains. A page SHALL be packed under a character budget well inside a client's result limit of about 30,000 tokens, adding Findings in order until the next would overflow and always including at least one. A Finding SHALL never be returned with a truncated relevance explanation. Trimming returns fewer Findings. Results SHALL include structured content beside their text.

#### Scenario: A large feed pages
- **WHEN** a Topic holds more Findings than fit one page
- **THEN** the first result holds as many whole Findings as fit and a next cursor, and following the cursor returns the rest

#### Scenario: Trimming moves a whole Finding to the next page
- **WHEN** the next Finding's full explanation would overflow the page's character budget
- **THEN** the page ends before it and that Finding leads the next page, intact

### Requirement: The server creates Topics and suggests Sources for a connected account
The server SHALL expose `create_topic` and `suggest_sources`. Each SHALL return the connect-an-account result to a visitor. `create_topic` SHALL take a name, a prompt, Sources as source option and value pairs, and invite emails, run the `createTopicFromDraft` Topic Tool, and return the new Topic's id and name, annotated `destructiveHint: true`. `suggest_sources` SHALL take a name and a prompt, run the `suggestTopicDraftSources` Topic Tool, and return the suggestions, annotated `readOnlyHint: true` and `openWorldHint: true`.

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

