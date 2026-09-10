## Context

Everything the MCP server serves already exists as a query. `loadTopicFindings` in `api/topic/findings.ts` reads a Topic's Findings joined to their Resources with the relevance explanation on every row, `retrieveFindings` in `worker/chat/retrieve.ts` ranks a Topic's Findings against an embedded question over `resources.embedding`, and `setConsumed`, `setRating`, and `setBookmarked` already handle the per-user writes with their own permission checks. `canSeeTopic` and `isTopicFindingVisible` take a nullable user and already work for a visitor. The api calls the worker in-process through `worker/index.ts`, which is how chat and attachments work today.

The chat is a `streamText` call in `worker/chat/index.ts` with one tool, `searchWeb`, and a system prompt written from `chat-topic.md`. `authorizeChatTurn` in `api/chat/turns.ts` resolves the reader once per turn through `isAllowed`. The topic editor's save in `api/topic/topics.ts` writes `topics.prompt` in place with no history, reconciles Sources by id, and starts llm-guard screening for new url Sources without starting a Scan.

Better Auth 1.6.24 is installed and ships an `mcp` plugin: an OAuth 2.1 authorization server with dynamic client registration and PKCE, three model tables, and `auth.api.getMcpSession`, which resolves a bearer token to its row by lookup and expiry check. Its discovery documents are produced by `oAuthDiscoveryMetadata(auth)` and `oAuthProtectedResourceMetadata(auth)`, which the app mounts at the origin root itself.

The page header's action menu is `PageActionMenu`, fed by `pageActionsStore`. Home, Topic, Team, and Profile register options; the Topic page registers for a visitor too.

Constraints: module boundaries under `bunx tsc -b`; every authority check through `isAllowed`; prompts as versioned markdown; one `package.json`; Bun; the comment-groups hook.

## Goals / Non-Goals

**Goals:**
- One MCP server whose tool list never depends on identity, reachable anonymously, and safe to leave open because a visitor can only ever read public Topics and spend a bounded shared budget
- Edit tools that have their own authorization and versioning, so the adapters are wiring and nothing more
- A chat that can act on a Topic for its editors without changing what every other reader has today
- An install dialog a reader can use from any page in under ten seconds, with a paste path that never depends on a deeplink handler working

**Non-Goals:**
- Registry discovery: `server.json`, submission, and `/docs/mcp` are the registry listing change
- A rollback control in the ui. The version table makes one a single read, and nobody has asked for it yet
- A personal rerank. None exists today; this change fixes where one would land, not what it does
- Any change to scoring, ingestion, or the Scan pipeline
- MCP resources or prompts. Tools alone cover the three reads, the three per-user writes, and the five Topic Tools

## Decisions

### Transport: the official SDK behind `@hono/mcp`, one `McpServer` per request

`@modelcontextprotocol/sdk` (1.x) is the protocol. `@hono/mcp` is its Streamable HTTP transport written for Hono's streaming, so the route is a plain `.all("/mcp", handler)` beside the api tree. The server runs stateless: each request builds a transport and an `McpServer` bound to the resolved caller, registers the nine tools through one `registerTools(server, caller)` function, handles the request, and lets both go. Session ids are not issued. Building a server per request costs microseconds against a database read and means no per-process session table to drift between replicas.

*Alternatives.* A hand-written JSON-RPC handler: the protocol has auth, pagination, and annotations that clients rely on, and reimplementing it to save a dependency is the wrong trade. A stateful server with session ids: nothing here needs a session, and stateless survives a redeploy with no client-side reconnect logic. The `@hono/mcp` package lists `hono-rate-limiter` as a peer dependency, so that limiter arrives with it and is what the rate limit below uses.

### Routing: `/mcp` and `/mcp/t/:topicId` run one handler with one difference

Both routes call the same handler. The topic-bound route resolves the path's Topic first and binds it: every tool's `topic_id` argument becomes optional and defaults to the bound Topic, `list_topics` returns that one Topic, and a call that names a different Topic is rejected with a plain message. Nothing else differs, so the tool list, the caller model, and the results are identical on both.

The path segment is the topic id. Topics have no slug column, `/topics/:id` and the RSS feed are id-addressed, and the domain model already rules that a profile is addressed by id so a name can change freely. A slug would be a second identifier and a migration for one route.

Both routes sit on the origin root beside `/releases`, mounted in `api/index.ts` ahead of the `/api/*` 404 and the static bundle. Only `/mcp` and `/mcp/t/*` are claimed, so the reserved-username list in `shared/usernames.ts` gains `mcp`.

### Identity: a caller is a visitor or a user, resolved once, before any read

`api/mcp/caller.ts` resolves the caller from the request: a bearer token that `auth.api.getMcpSession` accepts is a user, anything else is a visitor. The result is a small discriminated type, `{ kind: "visitor" }` or `{ kind: "user"; userId; litellmApiKey; plan }`, and every read tool branches on it explicitly. There is no path where a null user id flows into a personalized query.

The visitor branch reads public Topics only, through the same `canSeeTopic` and `isTopicFindingVisible` rules the pages use, so an invite or private Topic reads as missing. It builds the feed read without the consumed and bookmark joins, and it returns Findings in stored relevance order with no per-user step. No personal rerank exists today. Writing the visitor path this way is what keeps the month-2 rerank on the user branch alone.

The user branch reads what the pages would show that user: the visibility rules, the invite activation gate, consumed and bookmarked flags, and the writes routed through `setConsumed`, `setRating`, and `setBookmarked`, whose own checks decide.

### Auth: OAuth on the transport, discovery at the root, never a 401 mid-session

`api/auth.ts` adds Better Auth's `mcp` plugin with `loginPage: "/login"` and `resource` set to the origin's `/mcp`. Its authorization, token, and registration endpoints live under the existing `/api/auth/*` mount. `api/index.ts` serves `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` from the plugin's two metadata helpers, which is what lets a client discover where to authorize. Tokens are opaque rows in `oauth_access_tokens`, so no JWT plugin is needed.

An unauthenticated request is never rejected. Initialize and every read succeed as a visitor. A tool that needs an account, called by a visitor, returns an ordinary tool result whose text says what connecting an account enables and that the client's own connect control does it. The alternative, responding to that call with a 401 and a `WWW-Authenticate` header so the client starts OAuth by itself, was rejected: it takes the explanation away from the agent, and several clients treat a mid-session 401 as a dead server. URL-mode elicitation was considered and dropped too, since the authorize step needs the client's own registered id, which only the client's OAuth flow can supply.

Signing in on the way to consent: the plugin redirects an unauthenticated authorize request to the login page with the whole OAuth query attached. `LoginPage` learns one rule: when its query includes `client_id` and `redirect_uri`, the destination after sign-in is the authorize endpoint with that whole query, in place of `next`. Consent renders on a small SPA page, `/mcp/consent`, that names the client and posts accept or deny to the plugin's consent endpoint. The plugin's `oidcConfig.consentPage` points at it.

The plugin asks for consent only when the authorize request includes `prompt=consent`, and an MCP client never sends it, so on its own the plugin would hand a code to any registered client the moment a signed-in reader's browser reached the authorize url. That is a token for the taking by any page that redirects a signed-in reader. The api therefore sets `prompt=consent` on every MCP authorize request before the plugin sees it, so the consent page always stands between sign-in and the code, and the client's own request can never remove it.

### Spend and rate: the visitor pays from one public key, and one limiter covers MCP and the chat

The visitor branch's only model call is the search embedding. It runs on `LITELLM_PUBLIC_KEY`, a LiteLLM virtual key the operator provisions with its own monthly budget the same way per-user keys are made. When that key is spent, the proxy returns 429 with a budget body, `isBudgetRejection` recognizes it, and the search tool returns a message that the public budget is spent this month and an account keeps searching. Nothing else on the visitor path spends. A user's search embeds on their own key, as their chat does; the app's chat ledger does not save it, since an embedding costs a fraction of a cent and the key's own budget bounds it.

The chat has no per-caller rate limit today, only the monthly budget. This change adds one and applies it to both: `hono-rate-limiter` middleware from `api/rateLimit.ts`, a fixed window of one minute, one limit for every caller, keyed by the user a session or an accepted bearer token names (the MCP routes resolve the token ahead of the limiter, so an invalid token counts as a visitor), else by the client address the trusted proxies vouch for, else by one shared bucket. It mounts on the two private chat turn `POST` routes and on both MCP routes. The store is the limiter's in-memory default, which is per process, marked `ponytail:` with the shared-store upgrade named. Room turns keep their own budget rejection and are not covered, since a room turn already needs Carl to be addressed.

### Results fit the client's limit: cursor pages under a character budget, findings whole or not at all

Every list-shaped result paginates with an opaque cursor and includes `nextCursor` when more remains. A page is packed under a character budget, `MCP_PAGE_MAX_CHARS`, sized well inside the ~30,000 token limit a connector allows per result, with a default page size of twenty Findings. Packing adds Findings in order until the next one would overflow and always includes at least one, so a Finding is never returned with its relevance explanation cut. The packing function is pure and tested. Results include `structuredContent` beside the text block so a client that reads structured results gets typed rows.

The search tool ranks with the same query and embedding instruction `retrieveFindings` uses: `worker/chat/retrieve.ts` splits its ranking query out and exports `searchTopicFindings`, which runs that query and never reads a Resource's stored content. Search results are Findings with their explanations, not Resource text, which keeps a page small and keeps stored content out of a visitor's result.

### Edit tools: authorization and versioning inside, adapters outside

`api/tool/topicTools.ts` exports three functions with one shape: each takes `{ userId, topicId, ...input }`, loads the Topic, asks `isAllowed(userId, "topic:edit", topic)`, and returns a discriminated result of `saved`, `missing`, `forbidden`, or a named validation failure. A visitor is a null user id and is forbidden by the gate like any other. Neither adapter checks anything; a new tool or a fixed check reaches both adapters because both call the same function.

- `updateTopicPrompt` writes `topics.prompt` and inserts a Prompt Version in one transaction through `savePromptVersion(transaction, …)`. The editor's `updateTopic` calls the same function when the prompt changed, and `createTopic` writes the first version, so the history has one writer and starts at the beginning.
- `addTopicSource` takes a source option key and value, the same pair the picker and the suggestion flow use, builds the config through the shared registry, rejects a duplicate as already present, enforces `MAX_TOPIC_SOURCES`, inserts the row, and starts the pending llm-guard screen for a url kind. It never starts a Scan.
- `removeTopicSource` deletes a Source row that belongs to the Topic and returns saved for a row already gone. Both adapters expose the ids it takes: the chat's sources block ends each line with `[source <id>]`, and `list_topics` includes each Topic's ready Sources with their ids and labels.

`addTopicSource` also returns the projected cost delta: the Topic's mean cost over its last five succeeded Scans divided by its ready Source count, plus the ingester's own per-scan price for a paid kind, falling back to a fifth of `SCAN_COST_CENTS` for a Topic with no Scans, reported per scan and per month at the Topic's frequency. It is an estimate in cents, in Carl's mouth, and the honest metric rule says he is proud to say it.

A Prompt Version is a row in `topic_prompt_versions`: the Topic, the prompt text, who saved it, the origin (`editor`, `chat`, or `mcp`), and when. There is no version number column, since ordering by time is the history and a number would drift on a deleted row.

### The chat adapter: bound topic, gated tool list, propose then confirm

`authorizeChatTurn` gains `canEditTopic`, set by `isAllowed(userId, "topic:edit", topic)`, and the conversation payload includes it. When it is true the route builds the tool set through `toChatTopicTools({ userId, topicId })` in `api/tool/chatTools.ts`, three AI SDK tools whose `execute` closures call the three functions with the session's Topic. The Topic is not in any tool's input schema, so no message can point Carl at another one. `ChatTurnInput` gains `tools`, merged beside `searchWeb`. A turn for a reader without edit rights builds no tools and reads exactly as it does today. A Topic's team chat room turn does the same for the member who addressed Carl: `runModelChatRoomTurn` asks the gate for `topic:edit` on the room's Topic and builds the same tools when granted, so the whole room reads the proposal, the yes, and the change as its history. The team's own room has no Topic and gets none.

Confirmation is conversational. `chat-topic.md` gains a `{{editTopicBlock}}` slot in its instructions, filled from a new `chat-edit-topic.md` body when tools are on and a one-line no-edit note otherwise. The block tells Carl to propose first in prose, name the findings and their relevance explanations that motivate the change, and call a tool only in a turn after the reader agreed. Each tool's description repeats the rule. The alternative, the AI SDK's tool approval flow, needs a structured message stream and a pending call held across turns, and the chat is a text stream with client-held history. Two plain turns is the honest version of the same thing.

The tools list each save, and each change they reject, in the words a toast shows. The private chat's reply stream ends with the tool calls, which the api client strips and toasts, the way it already reads the failure marker, and the room's fan-out sends the toast lines as a `topicToolCalls` event after Carl's chat message. A save is a plain toast and a rejection an error toast, so a reader who was told "Done" learns what did not happen. Either chat then publishes a topic-changed count through the chat panel store, and the Topic page reloads its payload once per change, so it shows the new prompt or Source. The chat page context is serialized when it is registered, so a callback could not ride in it, and the store already bridges the panel and the page. The adapter's tools count their own calls into a total the route reads once the completion settles, the way the web search tool counts its searches, and a turn in which any fired is saved with its text kept regardless of what the persistence capability says. Today that capability is granted to every signed-in reader, so the rule changes nothing, but it holds if persistence is ever tiered.

### The MCP adapter: topic as argument, annotated, no second confirmation

The three tools register on the MCP server like the reads, with `topic_id` as an ordinary argument, annotated `readOnlyHint: false, destructiveHint: true`. A visitor's call returns the connect-an-account result. A user's call runs the function and returns its result, the cost delta included, with no confirmation step of its own. The read tools have `readOnlyHint: true`, and the per-user writes have `idempotentHint: true`. Wire names are snake_case per MCP convention (`update_topic_prompt`), while the functions keep the codebase's camelCase.

### Install dialog: one row, one dialog, one deeplink function

`PageActions` gains an optional `mcp: { name, url }` and `PageActionMenu` renders one "Add to AI" option after a page's own options, defaulting to the account server when a page sets none. The Topic page sets the topic-bound url and a name that includes the Topic's name, so a visitor on a public Topic installs a server that reads it without an account and an owner installs one that also rates and tunes it once connected.

The row opens `AddToAiDialog` in `ui/src/components/common/`. Its rows: Claude, ChatGPT, Gemini, Grok, Perplexity, DeepSeek, Cursor, VS Code, Copy server URL. Cursor and VS Code are anchors whose hrefs come from `toInstallDeeplink(deeplinkProvider, { name, url })` in `ui/src/lib/installDeeplinks.ts`: `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=…` with a base64 `{ url }` config, and `vscode://mcp/install?…` with url-encoded `{ name, url }` json. Claude and ChatGPT expand a short paste instruction with the url and a copy button, each instruction a constant that gets repointed at the directory listing once it exists. Copy server URL copies through the same clipboard path the share menu uses and confirms with a toast. The last chosen row is remembered in `localStorage` and moves to the top next time. Copy server URL never moves, so the paste path is always where a reader last saw it.

Voice follows the persona page: the option label, the dialog title, and the provider names are eyebrows, and the one line of body copy and the toasts are Carl's.

### Vocabulary

The `domain-model` skill gains Prompt Version and Topic Tool as entities and a layering rule for the MCP side: the program on the other end is a client, the person behind it is a user when a token resolves and a visitor when none does, and a caller is the pre-resolution word that never reaches an identifier. Both skill copies change together.

## Risks / Trade-offs

- [The OAuth resource identifier is `/mcp`, and a client connecting to `/mcp/t/<id>` may ask for path-inserted resource metadata] → Both routes accept the same tokens. The root well-known documents serve every client that falls back to them, which is what the spec requires. If a client will not connect without the path-inserted alias, the alias is one more route.
- [The rate limiter and the chat budget gate both reject, and the messages differ] → The limiter returns 429 with its own short body. The chat client already maps status to a rejection; a 429 reads as "slow down" in the panel, distinct from the budget prompt.
- [A public key that is spent silences visitor search for the rest of the month] → That is the bound doing its job. The result says so in words and names the account path. The key's budget is an operator setting, raised in LiteLLM without a deploy.
- [Carl calls a tool without a confirmation turn] → The prompt rule, the tool descriptions, and the client-side approval on the MCP side are the guards. The Prompt Version row makes any mistake reversible by a single read.
- [Response compression buffers the streamable HTTP response] → Hono's `compress` skips event streams. The smoke test exercises a real initialize and tool call through the running server.
- [Dynamic client registration lets anyone register a client] → That is the MCP auth model. The client still only receives a token after the signed-in reader consents on the app's own page.
- [Per-process rate limiter state] → Fine at one replica. Marked `ponytail:` with the shared store named.

## Migration Plan

1. `bun run db:generate` writes one migration for `topic_prompt_versions` and the three OAuth tables. It runs on deploy like every other.
2. Provision `LITELLM_PUBLIC_KEY` in LiteLLM with a monthly budget and set it in Doppler for prd before the deploy that ships this. `carl-up.sh` creates a dev one beside `LITELLM_DEV_KEY`. Until it is set, the visitor search tool returns a message that search needs an account, and every other tool works.
3. Sync the prompts with `bun run prompts:sync`.
4. Rollback is a redeploy of the previous image. The new tables are unread by older code and can stay.

## Open Questions

- Whether Claude's and ChatGPT's directory listings will include an install link once approved. The instruction constants are the seam either way.
